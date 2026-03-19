"""Gaze estimation and eye-tracking analysis without hardware eye tracker.

Uses MPIIGaze-style regression model for gaze direction estimation.
Extracts:
- Fixation stability (variance of gaze points)
- Saccade velocity (angular speed of gaze shifts)
- Microsleep detection (prolonged eye closure events)
"""

import math
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

import mediapipe as mp

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

LEFT_IRIS_INDICES = [468, 469, 470, 471]
RIGHT_IRIS_INDICES = [473, 474, 475, 476]
LEFT_EYE_CORNER_INDICES = [362, 263]
RIGHT_EYE_CORNER_INDICES = [33, 133]

MICROSLEEP_DURATION_THRESHOLD = 0.5
FIXATION_WINDOW_SECONDS = 2.0
SACCADE_VELOCITY_THRESHOLD = 30.0


@dataclass
class EyeTrackingFeatures:
    gaze_x: float = 0.0
    gaze_y: float = 0.0
    fixation_stability: float = 1.0
    saccade_velocity: float = 0.0
    saccade_count: int = 0
    microsleep_detected: bool = False
    microsleep_duration: float = 0.0
    pupil_size_left: float = 0.0
    pupil_size_right: float = 0.0
    gaze_available: bool = False


@dataclass
class EyeTrackingState:
    gaze_history: deque = field(default_factory=lambda: deque(maxlen=300))
    gaze_time_history: deque = field(default_factory=lambda: deque(maxlen=300))
    eye_closed_start: Optional[float] = None
    last_microsleep_duration: float = 0.0
    saccade_events: deque = field(default_factory=lambda: deque(maxlen=100))
    prev_gaze: Optional[tuple] = None
    prev_gaze_time: Optional[float] = None


def _compute_iris_center(landmarks, iris_indices: list, w: int, h: int) -> np.ndarray:
    """Compute the center of the iris from iris landmark indices."""
    points = np.array([
        [landmarks.landmark[i].x * w, landmarks.landmark[i].y * h]
        for i in iris_indices
    ])
    return points.mean(axis=0)


def _compute_gaze_ratio(landmarks, iris_indices: list, corner_indices: list, w: int, h: int) -> float:
    """Compute horizontal gaze ratio as iris position relative to eye corners."""
    iris_center = _compute_iris_center(landmarks, iris_indices, w, h)
    left_corner = np.array([
        landmarks.landmark[corner_indices[0]].x * w,
        landmarks.landmark[corner_indices[0]].y * h,
    ])
    right_corner = np.array([
        landmarks.landmark[corner_indices[1]].x * w,
        landmarks.landmark[corner_indices[1]].y * h,
    ])
    eye_width = np.linalg.norm(right_corner - left_corner)
    if eye_width < 1e-6:
        return 0.5
    ratio = np.linalg.norm(iris_center - left_corner) / eye_width
    return float(np.clip(ratio, 0.0, 1.0))


def _compute_pupil_diameter(landmarks, iris_indices: list, w: int, h: int) -> float:
    """Estimate pupil/iris diameter in pixels from iris landmarks."""
    points = np.array([
        [landmarks.landmark[i].x * w, landmarks.landmark[i].y * h]
        for i in iris_indices
    ])
    center = points.mean(axis=0)
    radii = np.linalg.norm(points - center, axis=1)
    return float(radii.mean() * 2.0)


class EyeTrackingAnalyzer:
    """Real-time eye tracking: gaze estimation, fixation, saccades, microsleep.

    NOTE: This analyzer reuses face landmarks from FaceVisionAnalyzer
    via analyze_landmarks() to avoid running a duplicate FaceMesh instance.
    The analyze_frame() method is kept as a fallback but should be avoided.
    """

    def __init__(self):
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.state = EyeTrackingState()
        self.gaze_model: Optional[ort.InferenceSession] = None
        self._load_gaze_model()

    def _load_gaze_model(self):
        """Load MPIIGaze-style ONNX model for gaze regression."""
        model_path = MODELS_DIR / "mpiigaze_regression.onnx"
        if HAS_ONNX and model_path.exists():
            self.gaze_model = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"],
            )

    def _estimate_gaze_from_model(self, left_eye_crop: np.ndarray, head_pose: np.ndarray) -> tuple[float, float]:
        """Use ONNX model for gaze direction estimation."""
        if self.gaze_model is None:
            return 0.0, 0.0
        resized = cv2.resize(left_eye_crop, (60, 36)).astype(np.float32) / 255.0
        eye_input = resized[np.newaxis, np.newaxis, ...]
        head_input = head_pose.astype(np.float32)[np.newaxis, ...]
        inputs = self.gaze_model.get_inputs()
        outputs = self.gaze_model.run(None, {
            inputs[0].name: eye_input,
            inputs[1].name: head_input,
        })
        gaze = outputs[0][0]
        return float(gaze[0]), float(gaze[1])

    def _estimate_gaze_from_iris(self, face_landmarks, w: int, h: int) -> tuple[float, float]:
        """Estimate gaze direction from iris position relative to eye corners."""
        left_ratio = _compute_gaze_ratio(
            face_landmarks, LEFT_IRIS_INDICES, LEFT_EYE_CORNER_INDICES, w, h
        )
        right_ratio = _compute_gaze_ratio(
            face_landmarks, RIGHT_IRIS_INDICES, RIGHT_EYE_CORNER_INDICES, w, h
        )
        gaze_x = (left_ratio + right_ratio) / 2.0
        nose_y = face_landmarks.landmark[1].y
        left_iris_y = np.mean([face_landmarks.landmark[i].y for i in LEFT_IRIS_INDICES])
        right_iris_y = np.mean([face_landmarks.landmark[i].y for i in RIGHT_IRIS_INDICES])
        avg_iris_y = (left_iris_y + right_iris_y) / 2.0
        gaze_y = float(np.clip((avg_iris_y - nose_y + 0.05) * 10.0, -1.0, 1.0))
        gaze_x_normalized = (gaze_x - 0.5) * 2.0
        return gaze_x_normalized, gaze_y

    def analyze_landmarks(self, face_landmarks, w: int, h: int, avg_ear: float = 0.3) -> EyeTrackingFeatures:
        """Analyze eye-tracking features from pre-computed face landmarks.

        This avoids running a duplicate FaceMesh pass. Preferred over analyze_frame().
        """
        features = EyeTrackingFeatures()
        now = time.time()

        if face_landmarks is None:
            self._check_microsleep(now, avg_ear, features)
            return features

        features.gaze_available = True

        gaze_x, gaze_y = self._estimate_gaze_from_iris(face_landmarks, w, h)
        features.gaze_x = gaze_x
        features.gaze_y = gaze_y

        features.pupil_size_left = _compute_pupil_diameter(
            face_landmarks, LEFT_IRIS_INDICES, w, h
        )
        features.pupil_size_right = _compute_pupil_diameter(
            face_landmarks, RIGHT_IRIS_INDICES, w, h
        )

        self.state.gaze_history.append((gaze_x, gaze_y))
        self.state.gaze_time_history.append(now)

        features.fixation_stability = self._compute_fixation_stability(now)

        if self.state.prev_gaze is not None and self.state.prev_gaze_time is not None:
            dt = now - self.state.prev_gaze_time
            if dt > 0.001:
                dx = gaze_x - self.state.prev_gaze[0]
                dy = gaze_y - self.state.prev_gaze[1]
                angular_dist = math.sqrt(dx * dx + dy * dy) * 57.2958
                velocity = angular_dist / dt
                features.saccade_velocity = velocity
                if velocity > SACCADE_VELOCITY_THRESHOLD:
                    self.state.saccade_events.append(now)

        self.state.prev_gaze = (gaze_x, gaze_y)
        self.state.prev_gaze_time = now

        cutoff = now - 60.0
        while self.state.saccade_events and self.state.saccade_events[0] < cutoff:
            self.state.saccade_events.popleft()
        features.saccade_count = len(self.state.saccade_events)

        self._check_microsleep(now, avg_ear, features)

        return features

    def analyze_frame(self, frame: np.ndarray, avg_ear: float = 0.3) -> EyeTrackingFeatures:
        """Analyze a single frame for eye-tracking features (fallback — prefer analyze_landmarks)."""
        h, w = frame.shape[:2]
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(rgb_frame)

        face_landmarks = results.multi_face_landmarks[0] if results.multi_face_landmarks else None
        return self.analyze_landmarks(face_landmarks, w, h, avg_ear)

    def _compute_fixation_stability(self, now: float) -> float:
        """Compute fixation stability as inverse of gaze variance over a window."""
        cutoff = now - FIXATION_WINDOW_SECONDS
        recent_gaze = []
        for (gx, gy), t in zip(
            reversed(list(self.state.gaze_history)),
            reversed(list(self.state.gaze_time_history)),
        ):
            if t < cutoff:
                break
            recent_gaze.append((gx, gy))

        if len(recent_gaze) < 5:
            return 1.0

        points = np.array(recent_gaze)
        variance = np.var(points[:, 0]) + np.var(points[:, 1])
        stability = 1.0 / (1.0 + variance * 100.0)
        return float(np.clip(stability, 0.0, 1.0))

    def _check_microsleep(self, now: float, avg_ear: float, features: EyeTrackingFeatures):
        """Detect microsleep events from prolonged eye closure."""
        is_closed = avg_ear < 0.18

        if is_closed:
            if self.state.eye_closed_start is None:
                self.state.eye_closed_start = now
            else:
                duration = now - self.state.eye_closed_start
                if duration >= MICROSLEEP_DURATION_THRESHOLD:
                    features.microsleep_detected = True
                    features.microsleep_duration = duration
        else:
            if self.state.eye_closed_start is not None:
                duration = now - self.state.eye_closed_start
                if duration >= MICROSLEEP_DURATION_THRESHOLD:
                    self.state.last_microsleep_duration = duration
                self.state.eye_closed_start = None

    def compute_fatigue_score(
        self,
        features: EyeTrackingFeatures,
        baseline_gaze_stability: float = 0.9,
    ) -> float:
        """Compute eye-tracking fatigue sub-score (0-100)."""
        if not features.gaze_available:
            return 50.0

        stability_drop = max(0.0, baseline_gaze_stability - features.fixation_stability)
        stability_score = min(stability_drop / max(baseline_gaze_stability, 0.01) * 50, 35.0)

        saccade_score = min(features.saccade_count / 60.0 * 20.0, 25.0)

        microsleep_score = 0.0
        if features.microsleep_detected:
            microsleep_score = min(features.microsleep_duration * 20.0, 40.0)

        total = stability_score + saccade_score + microsleep_score
        return float(min(max(total, 0.0), 100.0))

    def close(self):
        self.face_mesh.close()
