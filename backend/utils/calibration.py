"""Calibration module for establishing personalized baselines.

Runs a 60-second onboarding session where the system captures:
- Baseline blink rate
- Baseline PERCLOS
- Baseline typing speed and rhythm entropy
- Baseline mouse jitter
- Baseline gaze stability
- Baseline F0 (fundamental frequency) and speech rate

These baselines personalize fatigue detection thresholds.
"""

import time
from dataclasses import dataclass, field

import numpy as np

from neurolens.backend.modalities.face_vision import FaceVisionAnalyzer, VisionFeatures
from neurolens.backend.modalities.eye_tracking import EyeTrackingAnalyzer, EyeTrackingFeatures
from neurolens.backend.modalities.biometrics import BiometricsAnalyzer, BiometricFeatures
from neurolens.backend.modalities.audio_stress import AudioStressAnalyzer, AudioFeatures

CALIBRATION_DURATION_SECONDS = 60


@dataclass
class CalibrationData:
    blink_rates: list[float] = field(default_factory=list)
    perclos_values: list[float] = field(default_factory=list)
    typing_speeds: list[float] = field(default_factory=list)
    typing_entropies: list[float] = field(default_factory=list)
    mouse_jitters: list[float] = field(default_factory=list)
    gaze_stabilities: list[float] = field(default_factory=list)
    f0_values: list[float] = field(default_factory=list)
    speech_rates: list[float] = field(default_factory=list)
    samples_collected: int = 0
    elapsed_seconds: float = 0.0


@dataclass
class CalibrationResult:
    baseline_blink_rate: float = 15.0
    baseline_perclos: float = 0.05
    baseline_typing_speed: float = 60.0
    baseline_typing_entropy: float = 1.5
    baseline_mouse_jitter: float = 2.0
    baseline_gaze_stability: float = 0.9
    baseline_f0_mean: float = 120.0
    baseline_speech_rate: float = 3.5
    is_valid: bool = False
    duration_seconds: float = 0.0
    total_samples: int = 0


def _robust_mean(values: list[float], trim_percent: float = 0.1) -> float:
    """Compute trimmed mean, removing top/bottom outliers."""
    if not values:
        return 0.0
    arr = sorted(values)
    n = len(arr)
    trim = max(1, int(n * trim_percent))
    if n <= 2 * trim + 1:
        return float(np.mean(arr))
    trimmed = arr[trim:-trim]
    return float(np.mean(trimmed))


class CalibrationSession:
    """Manages a 60-second calibration session to establish personal baselines."""

    def __init__(self):
        self.data = CalibrationData()
        self.start_time: float = 0.0
        self.is_running: bool = False
        self.is_complete: bool = False

    def start(self):
        """Start the calibration timer."""
        self.start_time = time.time()
        self.is_running = True
        self.is_complete = False
        self.data = CalibrationData()

    def add_vision_sample(self, features: VisionFeatures):
        """Record a vision features sample during calibration."""
        if not self.is_running:
            return
        if features.landmarks_detected:
            self.data.blink_rates.append(features.blink_rate)
            self.data.perclos_values.append(features.perclos)

    def add_eye_tracking_sample(self, features: EyeTrackingFeatures):
        """Record an eye-tracking features sample during calibration."""
        if not self.is_running:
            return
        if features.gaze_available:
            self.data.gaze_stabilities.append(features.fixation_stability)

    def add_biometric_sample(self, features: BiometricFeatures):
        """Record a biometric features sample during calibration."""
        if not self.is_running:
            return
        if features.has_keystroke_data:
            self.data.typing_speeds.append(features.keystroke.typing_speed_wpm)
            self.data.typing_entropies.append(features.keystroke.rhythm_entropy)
        if features.has_mouse_data:
            self.data.mouse_jitters.append(features.mouse.jitter)

    def add_audio_sample(self, features: AudioFeatures):
        """Record an audio features sample during calibration."""
        if not self.is_running:
            return
        if features.has_speech and features.f0_mean > 0:
            self.data.f0_values.append(features.f0_mean)
            self.data.speech_rates.append(features.speech_rate)

    def tick(self) -> float:
        """Update elapsed time and check if calibration is complete.
        Returns progress as fraction (0.0 to 1.0).
        """
        if not self.is_running:
            return 0.0
        self.data.elapsed_seconds = time.time() - self.start_time
        self.data.samples_collected += 1
        if self.data.elapsed_seconds >= CALIBRATION_DURATION_SECONDS:
            self.is_running = False
            self.is_complete = True
            return 1.0
        return self.data.elapsed_seconds / CALIBRATION_DURATION_SECONDS

    def get_result(self) -> CalibrationResult:
        """Compute calibration baselines from collected samples."""
        result = CalibrationResult(
            duration_seconds=self.data.elapsed_seconds,
            total_samples=self.data.samples_collected,
        )

        has_vision = len(self.data.blink_rates) >= 5
        has_gaze = len(self.data.gaze_stabilities) >= 5

        if has_vision:
            result.baseline_blink_rate = _robust_mean(self.data.blink_rates)
            result.baseline_perclos = _robust_mean(self.data.perclos_values)
        if has_gaze:
            result.baseline_gaze_stability = _robust_mean(self.data.gaze_stabilities)
        if self.data.typing_speeds:
            result.baseline_typing_speed = _robust_mean(self.data.typing_speeds)
        if self.data.typing_entropies:
            result.baseline_typing_entropy = _robust_mean(self.data.typing_entropies)
        if self.data.mouse_jitters:
            result.baseline_mouse_jitter = _robust_mean(self.data.mouse_jitters)
        if self.data.f0_values:
            result.baseline_f0_mean = _robust_mean(self.data.f0_values)
        if self.data.speech_rates:
            result.baseline_speech_rate = _robust_mean(self.data.speech_rates)

        result.is_valid = has_vision and self.data.elapsed_seconds >= 30.0
        return result

    def get_progress(self) -> dict:
        """Return current calibration progress info."""
        return {
            "is_running": self.is_running,
            "is_complete": self.is_complete,
            "elapsed_seconds": round(self.data.elapsed_seconds, 1),
            "total_duration": CALIBRATION_DURATION_SECONDS,
            "progress": round(self.data.elapsed_seconds / CALIBRATION_DURATION_SECONDS, 2),
            "samples_collected": self.data.samples_collected,
            "has_vision": len(self.data.blink_rates) >= 5,
            "has_gaze": len(self.data.gaze_stabilities) >= 5,
            "has_keystroke": len(self.data.typing_speeds) >= 3,
            "has_mouse": len(self.data.mouse_jitters) >= 3,
            "has_audio": len(self.data.f0_values) >= 3,
        }
