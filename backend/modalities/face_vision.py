"""Facial micro-expression analysis using MediaPipe FaceMesh + MobileNetV3 ONNX.

Extracts:
- Blink rate (blinks per minute)
- PERCLOS (percentage of eye closure over time window)
- Head pose estimation (pitch, yaw, roll via solvePnP)
- Micro-expression classification via MobileNetV3 ONNX
"""

import math
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import mediapipe as mp
import numpy as np

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]

FACE_3D_MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),         # Nose tip
    (0.0, -330.0, -65.0),    # Chin
    (-225.0, 170.0, -135.0), # Left eye left corner
    (225.0, 170.0, -135.0),  # Right eye right corner
    (-150.0, -150.0, -125.0),# Left mouth corner
    (150.0, -150.0, -125.0), # Right mouth corner
], dtype=np.float64)

FACE_2D_LANDMARK_INDICES = [1, 152, 263, 33, 287, 57]

EXPRESSION_LABELS = [
    "neutral", "happy", "sad", "surprise", "fear", "disgust", "anger", "contempt"
]

EAR_BLINK_THRESHOLD = 0.21
PERCLOS_WINDOW_SECONDS = 60
PERCLOS_CLOSED_THRESHOLD = 0.22


@dataclass
class VisionFeatures:
    blink_rate: float = 0.0
    perclos: float = 0.0
    head_pitch: float = 0.0
    head_yaw: float = 0.0
    head_roll: float = 0.0
    dominant_expression: str = "neutral"
    expression_confidence: float = 0.0
    left_ear: float = 0.0
    right_ear: float = 0.0
    landmarks_detected: bool = False
    raw_face_landmarks: object = None  # MediaPipe NormalizedLandmarkList
    frame_width: int = 0
    frame_height: int = 0


@dataclass
class VisionState:
    blink_timestamps: deque = field(default_factory=lambda: deque(maxlen=200))
    ear_history: deque = field(default_factory=lambda: deque(maxlen=3600))
    ear_time_history: deque = field(default_factory=lambda: deque(maxlen=3600))
    was_eye_closed: bool = False
    last_blink_time: float = 0.0


def _compute_ear(eye_landmarks: np.ndarray) -> float:
    """Compute Eye Aspect Ratio (EAR) from 6 landmark points."""
    vertical_1 = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
    vertical_2 = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
    horizontal = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
    if horizontal < 1e-6:
        return 0.3
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def _extract_eye_landmarks(face_landmarks, indices: list, w: int, h: int) -> np.ndarray:
    """Extract eye landmark coordinates from MediaPipe face landmarks."""
    return np.array([
        [face_landmarks.landmark[i].x * w, face_landmarks.landmark[i].y * h]
        for i in indices
    ])


def _estimate_head_pose(face_landmarks, w: int, h: int) -> tuple[float, float, float]:
    """Estimate head pose (pitch, yaw, roll) using solvePnP."""
    image_points = np.array([
        (face_landmarks.landmark[i].x * w, face_landmarks.landmark[i].y * h)
        for i in FACE_2D_LANDMARK_INDICES
    ], dtype=np.float64)

    focal_length = w
    center = (w / 2, h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    success, rotation_vector, _ = cv2.solvePnP(
        FACE_3D_MODEL_POINTS, image_points, camera_matrix, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not success:
        return 0.0, 0.0, 0.0

    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
    proj_matrix = np.hstack((rotation_matrix, np.zeros((3, 1))))
    euler_angles = cv2.decomposeProjectionMatrix(proj_matrix)[6]

    pitch = float(euler_angles[0, 0])
    yaw = float(euler_angles[1, 0])
    roll = float(euler_angles[2, 0])
    return pitch, yaw, roll


class FaceVisionAnalyzer:
    """Real-time facial analysis: blink rate, PERCLOS, head pose, micro-expressions."""

    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.state = VisionState()
        self.expression_session: Optional[ort.InferenceSession] = None
        self._load_expression_model()

    def _load_expression_model(self):
        """Load MobileNetV3 ONNX model for expression classification."""
        model_path = MODELS_DIR / "mobilenetv3_expression.onnx"
        if HAS_ONNX and model_path.exists():
            self.expression_session = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"],
            )

    def _classify_expression(self, face_crop: np.ndarray) -> tuple[str, float]:
        """Run expression classification on a cropped face image."""
        if self.expression_session is None:
            return "neutral", 0.0

        resized = cv2.resize(face_crop, (224, 224))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        normalized = (rgb - mean) / std
        input_tensor = np.transpose(normalized, (2, 0, 1))[np.newaxis, ...]

        input_name = self.expression_session.get_inputs()[0].name
        outputs = self.expression_session.run(None, {input_name: input_tensor})
        logits = outputs[0][0]

        exp_logits = np.exp(logits - np.max(logits))
        probs = exp_logits / exp_logits.sum()
        idx = int(np.argmax(probs))
        return EXPRESSION_LABELS[idx], float(probs[idx])

    def _get_face_crop(self, frame: np.ndarray, face_landmarks, w: int, h: int) -> np.ndarray:
        """Extract a bounding-box crop of the face from landmarks."""
        xs = [face_landmarks.landmark[i].x * w for i in range(468)]
        ys = [face_landmarks.landmark[i].y * h for i in range(468)]
        x_min, x_max = int(max(0, min(xs) - 10)), int(min(w, max(xs) + 10))
        y_min, y_max = int(max(0, min(ys) - 10)), int(min(h, max(ys) + 10))
        crop = frame[y_min:y_max, x_min:x_max]
        if crop.size == 0:
            return np.zeros((224, 224, 3), dtype=np.uint8)
        return crop

    def analyze_frame(self, frame: np.ndarray) -> VisionFeatures:
        """Analyze a single BGR video frame and return vision features."""
        features = VisionFeatures()
        h, w = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)

        if not results.multi_face_landmarks:
            return features

        face_landmarks = results.multi_face_landmarks[0]
        features.landmarks_detected = True
        features.raw_face_landmarks = face_landmarks
        features.frame_width = w
        features.frame_height = h
        now = time.time()

        left_eye = _extract_eye_landmarks(face_landmarks, LEFT_EYE_INDICES, w, h)
        right_eye = _extract_eye_landmarks(face_landmarks, RIGHT_EYE_INDICES, w, h)
        left_ear = _compute_ear(left_eye)
        right_ear = _compute_ear(right_eye)
        avg_ear = (left_ear + right_ear) / 2.0
        features.left_ear = left_ear
        features.right_ear = right_ear

        self.state.ear_history.append(avg_ear)
        self.state.ear_time_history.append(now)

        is_closed = avg_ear < EAR_BLINK_THRESHOLD
        if is_closed and not self.state.was_eye_closed:
            if now - self.state.last_blink_time > 0.15:
                self.state.blink_timestamps.append(now)
                self.state.last_blink_time = now
        self.state.was_eye_closed = is_closed

        cutoff = now - 60.0
        while self.state.blink_timestamps and self.state.blink_timestamps[0] < cutoff:
            self.state.blink_timestamps.popleft()
        features.blink_rate = float(len(self.state.blink_timestamps))

        perclos_cutoff = now - PERCLOS_WINDOW_SECONDS
        closed_count = 0
        total_count = 0
        # Iterate deque from newest to oldest without list conversion
        for i in range(len(self.state.ear_history) - 1, -1, -1):
            t = self.state.ear_time_history[i]
            if t < perclos_cutoff:
                break
            total_count += 1
            if self.state.ear_history[i] < PERCLOS_CLOSED_THRESHOLD:
                closed_count += 1
        features.perclos = (closed_count / total_count) if total_count > 0 else 0.0

        pitch, yaw, roll = _estimate_head_pose(face_landmarks, w, h)
        features.head_pitch = pitch
        features.head_yaw = yaw
        features.head_roll = roll

        face_crop = self._get_face_crop(frame, face_landmarks, w, h)
        expression, confidence = self._classify_expression(face_crop)
        features.dominant_expression = expression
        features.expression_confidence = confidence

        return features

    def compute_fatigue_score(self, features: VisionFeatures, baseline_blink_rate: float = 15.0, baseline_perclos: float = 0.05) -> float:
        """Compute vision-modality fatigue sub-score (0-100)."""
        if not features.landmarks_detected:
            return 50.0

        blink_deviation = abs(features.blink_rate - baseline_blink_rate) / max(baseline_blink_rate, 1.0)
        blink_score = min(blink_deviation * 40, 40.0)

        perclos_ratio = features.perclos / max(baseline_perclos, 0.01)
        perclos_score = min(perclos_ratio * 15, 30.0)

        head_instability = (abs(features.head_pitch) + abs(features.head_yaw)) / 90.0
        head_score = min(head_instability * 15, 15.0)

        expression_score = 0.0
        fatigue_expressions = {"sad", "fear", "disgust", "contempt"}
        if features.dominant_expression in fatigue_expressions:
            expression_score = features.expression_confidence * 15.0

        total = blink_score + perclos_score + head_score + expression_score
        return min(max(total, 0.0), 100.0)

    def get_overlay_frame(self, frame: np.ndarray) -> np.ndarray:
        """Return frame with MediaPipe face mesh overlay drawn."""
        h, w = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)
        annotated = frame.copy()

        if results.multi_face_landmarks:
            mp_drawing = mp.solutions.drawing_utils
            mp_drawing_styles = mp.solutions.drawing_styles
            for face_landmarks in results.multi_face_landmarks:
                mp_drawing.draw_landmarks(
                    image=annotated,
                    landmark_list=face_landmarks,
                    connections=self.mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_tesselation_style(),
                )
                mp_drawing.draw_landmarks(
                    image=annotated,
                    landmark_list=face_landmarks,
                    connections=self.mp_face_mesh.FACEMESH_CONTOURS,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_contours_style(),
                )
        return annotated

    def close(self):
        self.face_mesh.close()
