"""Late-fusion multimodal ensemble using XGBoost meta-learner.

Each modality produces a fatigue sub-score (0-100).
The XGBoost meta-learner combines them into a unified Cognitive Load Index (CLI).
Falls back to weighted average if no trained model is available.

Fatigue stages:
- Alert:      CLI 0-30
- Borderline: CLI 31-55
- Fatigued:   CLI 56-75
- Critical:   CLI 76-100
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

FATIGUE_STAGES = {
    "alert": (0, 30),
    "borderline": (31, 55),
    "fatigued": (56, 75),
    "critical": (76, 100),
}

DEFAULT_WEIGHTS = {
    "vision": 0.30,
    "eye": 0.25,
    "biometric": 0.25,
    "audio": 0.20,
}


@dataclass
class FusionResult:
    cli_score: float = 0.0
    fatigue_stage: str = "alert"
    vision_score: float = 0.0
    eye_score: float = 0.0
    biometric_score: float = 0.0
    audio_score: float = 0.0
    confidence: float = 0.0
    modality_weights: dict = None

    def __post_init__(self):
        if self.modality_weights is None:
            self.modality_weights = dict(DEFAULT_WEIGHTS)


def _classify_stage(cli_score: float) -> str:
    """Map CLI score to fatigue stage label."""
    score = int(round(cli_score))
    for stage, (low, high) in FATIGUE_STAGES.items():
        if low <= score <= high:
            return stage
    return "critical" if score > 100 else "alert"


def _weighted_average(scores: dict[str, float], weights: dict[str, float]) -> float:
    """Compute weighted average, handling missing modalities gracefully."""
    total_weight = 0.0
    weighted_sum = 0.0
    for modality, score in scores.items():
        w = weights.get(modality, 0.0)
        weighted_sum += score * w
        total_weight += w
    if total_weight < 1e-6:
        return 50.0
    return weighted_sum / total_weight


class FusionEnsemble:
    """Multimodal late-fusion ensemble with XGBoost meta-learner."""

    def __init__(self):
        self.xgb_session: Optional[ort.InferenceSession] = None
        self.weights = dict(DEFAULT_WEIGHTS)
        self._load_model()
        self._ema_cli: Optional[float] = None
        self._ema_alpha = 0.15  # Smoother EMA for less jittery readings

    def _load_model(self):
        """Load XGBoost ONNX model for meta-learning fusion."""
        model_path = MODELS_DIR / "xgboost_fusion.onnx"
        if HAS_ONNX and model_path.exists():
            self.xgb_session = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"],
            )

    def _predict_with_xgboost(self, feature_vector: np.ndarray) -> float:
        """Run XGBoost meta-learner on sub-scores + derived features."""
        if self.xgb_session is None:
            return -1.0
        input_tensor = feature_vector.astype(np.float32)[np.newaxis, :]
        input_name = self.xgb_session.get_inputs()[0].name
        outputs = self.xgb_session.run(None, {input_name: input_tensor})
        return float(np.clip(outputs[0][0], 0.0, 100.0))

    def fuse(
        self,
        vision_score: Optional[float],
        eye_score: Optional[float],
        biometric_score: Optional[float],
        audio_score: Optional[float],
    ) -> FusionResult:
        """Fuse modality sub-scores into a unified CLI score.

        Scores can be None if the modality has no data — these are excluded
        from the weighted average rather than defaulting to 50.0, which would
        inflate the CLI score when only some modalities are active.
        """
        # Build scores dict with only active modalities
        all_scores = {
            "vision": vision_score,
            "eye": eye_score,
            "biometric": biometric_score,
            "audio": audio_score,
        }
        active_scores = {k: v for k, v in all_scores.items() if v is not None}

        # If no modalities have data, return a neutral low score
        if not active_scores:
            return FusionResult(
                cli_score=0.0,
                fatigue_stage="alert",
                confidence=0.0,
                modality_weights=dict(self.weights),
            )

        # Fill in zeros for display purposes
        v = vision_score if vision_score is not None else 0.0
        e = eye_score if eye_score is not None else 0.0
        b = biometric_score if biometric_score is not None else 0.0
        a = audio_score if audio_score is not None else 0.0

        # Try XGBoost if all four modalities are available
        xgb_score = -1.0
        if len(active_scores) == 4:
            feature_vector = np.array([
                v, e, b, a,
                max(v, e, b, a),
                min(v, e, b, a),
                np.std([v, e, b, a]),
                (v + e) / 2.0,
            ])
            xgb_score = self._predict_with_xgboost(feature_vector)

        if xgb_score >= 0:
            raw_cli = xgb_score
        else:
            raw_cli = _weighted_average(active_scores, self.weights)

        if self._ema_cli is None:
            self._ema_cli = raw_cli
        else:
            self._ema_cli = self._ema_alpha * raw_cli + (1.0 - self._ema_alpha) * self._ema_cli

        cli_score = round(self._ema_cli, 1)

        # Confidence based on how many modalities are active and how consistent they are
        active_values = list(active_scores.values())
        score_std = float(np.std(active_values)) if len(active_values) > 1 else 0.0
        modality_coverage = len(active_scores) / 4.0
        confidence = max(0.0, modality_coverage * (1.0 - score_std / 50.0))

        return FusionResult(
            cli_score=cli_score,
            fatigue_stage=_classify_stage(cli_score),
            vision_score=v,
            eye_score=e,
            biometric_score=b,
            audio_score=a,
            confidence=round(confidence, 2),
            modality_weights=dict(self.weights),
        )

    def update_weights(self, new_weights: dict[str, float]):
        """Update modality weights (e.g., from calibration)."""
        for key in DEFAULT_WEIGHTS:
            if key in new_weights:
                self.weights[key] = new_weights[key]
        total = sum(self.weights.values())
        if total > 0:
            self.weights = {k: v / total for k, v in self.weights.items()}

    def reset(self):
        """Reset EMA state for a new session."""
        self._ema_cli = None
