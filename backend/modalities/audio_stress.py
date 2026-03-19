"""Audio stress analysis using Librosa feature extraction and LSTM ONNX model.

Extracts:
- Speech rate (syllables per second estimated from energy peaks)
- Vocal tremor (modulation in fundamental frequency F0)
- Fundamental frequency (F0) drop from baseline
- Silence ratio (proportion of silence in audio window)

Maps features to arousal-valence plane using lightweight LSTM.
"""

import math
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

try:
    import librosa
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False

try:
    import onnxruntime as ort
    HAS_ONNX = True
except ImportError:
    HAS_ONNX = False

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

SAMPLE_RATE = 16000
FRAME_LENGTH = 2048
HOP_LENGTH = 512
SILENCE_THRESHOLD_DB = -40.0
MIN_F0 = 50.0
MAX_F0 = 500.0


@dataclass
class AudioFeatures:
    speech_rate: float = 0.0
    vocal_tremor: float = 0.0
    f0_mean: float = 0.0
    f0_std: float = 0.0
    f0_drop_ratio: float = 0.0
    silence_ratio: float = 0.0
    arousal: float = 0.0
    valence: float = 0.0
    energy_mean: float = 0.0
    has_speech: bool = False


@dataclass
class AudioState:
    f0_history: deque = field(default_factory=lambda: deque(maxlen=300))
    speech_rate_history: deque = field(default_factory=lambda: deque(maxlen=60))
    energy_history: deque = field(default_factory=lambda: deque(maxlen=300))


def _estimate_speech_rate(audio: np.ndarray, sr: int) -> float:
    """Estimate speech rate from energy peaks (syllable nuclei detection)."""
    if not HAS_LIBROSA:
        return 0.0
    rms = librosa.feature.rms(y=audio, frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH)[0]
    if len(rms) < 3:
        return 0.0

    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    threshold = np.median(rms_db) + 3.0
    above = rms_db > threshold
    transitions = np.diff(above.astype(int))
    peaks = np.sum(transitions == 1)
    duration = len(audio) / sr
    if duration < 0.1:
        return 0.0
    return peaks / duration


def _extract_f0(audio: np.ndarray, sr: int) -> np.ndarray:
    """Extract fundamental frequency (F0) using pyin algorithm."""
    if not HAS_LIBROSA:
        return np.array([])
    f0, voiced_flag, _ = librosa.pyin(
        audio, fmin=MIN_F0, fmax=MAX_F0, sr=sr,
        frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH,
    )
    voiced_f0 = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]
    return voiced_f0


def _compute_vocal_tremor(f0_values: np.ndarray) -> float:
    """Compute vocal tremor as coefficient of variation of F0 modulation.

    Tremor manifests as 4-8 Hz modulation in F0 contour.
    """
    if len(f0_values) < 10:
        return 0.0
    f0_detrended = f0_values - np.mean(f0_values)
    if np.std(f0_values) < 1e-6:
        return 0.0
    fft_vals = np.abs(np.fft.rfft(f0_detrended))
    freqs = np.fft.rfftfreq(len(f0_detrended), d=HOP_LENGTH / SAMPLE_RATE)
    tremor_band = (freqs >= 4.0) & (freqs <= 8.0)
    total_energy = np.sum(fft_vals ** 2) + 1e-10
    tremor_energy = np.sum(fft_vals[tremor_band] ** 2)
    return float(tremor_energy / total_energy)


def _compute_silence_ratio(audio: np.ndarray, sr: int) -> float:
    """Compute the ratio of silent frames to total frames."""
    if not HAS_LIBROSA:
        return 0.0
    rms = librosa.feature.rms(y=audio, frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    silent_frames = np.sum(rms_db < SILENCE_THRESHOLD_DB)
    total_frames = len(rms_db)
    if total_frames == 0:
        return 0.0
    return float(silent_frames / total_frames)


class AudioStressAnalyzer:
    """Real-time audio stress detection: speech rate, tremor, F0, silence, arousal-valence."""

    def __init__(self):
        self.state = AudioState()
        self.lstm_session: Optional[ort.InferenceSession] = None
        self._load_lstm_model()

    def _load_lstm_model(self):
        """Load LSTM ONNX model for arousal-valence mapping."""
        model_path = MODELS_DIR / "audio_stress_lstm.onnx"
        if HAS_ONNX and model_path.exists():
            self.lstm_session = ort.InferenceSession(
                str(model_path),
                providers=["CPUExecutionProvider"],
            )

    def _predict_arousal_valence(self, feature_vector: np.ndarray) -> tuple[float, float]:
        """Predict arousal and valence from extracted audio features using LSTM."""
        if self.lstm_session is None:
            speech_rate, tremor, f0_mean, f0_std, silence_ratio, energy = (
                feature_vector[0], feature_vector[1], feature_vector[2],
                feature_vector[3], feature_vector[4], feature_vector[5],
            )
            arousal = float(np.clip(
                0.3 * (1.0 - silence_ratio) + 0.3 * min(speech_rate / 5.0, 1.0) +
                0.2 * tremor * 5.0 + 0.2 * min(energy / 0.1, 1.0),
                0.0, 1.0,
            ))
            valence = float(np.clip(
                0.5 - 0.3 * tremor * 5.0 - 0.2 * max(0.0, silence_ratio - 0.3) +
                0.2 * min(f0_mean / 200.0, 1.0),
                0.0, 1.0,
            ))
            return arousal, valence

        input_tensor = feature_vector.astype(np.float32)[np.newaxis, np.newaxis, :]
        input_name = self.lstm_session.get_inputs()[0].name
        outputs = self.lstm_session.run(None, {input_name: input_tensor})
        result = outputs[0][0]
        return float(np.clip(result[0], 0.0, 1.0)), float(np.clip(result[1], 0.0, 1.0))

    def analyze_chunk(self, audio_chunk: np.ndarray, sr: int = SAMPLE_RATE) -> AudioFeatures:
        """Analyze an audio chunk (1-5 seconds of float32 PCM data)."""
        features = AudioFeatures()

        if not HAS_LIBROSA or len(audio_chunk) < sr * 0.1:
            return features

        audio = audio_chunk.astype(np.float32)
        if np.max(np.abs(audio)) > 1.0:
            audio = audio / 32768.0

        rms = librosa.feature.rms(y=audio, frame_length=FRAME_LENGTH, hop_length=HOP_LENGTH)[0]
        features.energy_mean = float(np.mean(rms))
        self.state.energy_history.append(features.energy_mean)

        if features.energy_mean < 0.005:
            features.silence_ratio = 1.0
            return features

        features.has_speech = True
        features.speech_rate = _estimate_speech_rate(audio, sr)
        self.state.speech_rate_history.append(features.speech_rate)

        f0_values = _extract_f0(audio, sr)
        if len(f0_values) > 0:
            features.f0_mean = float(np.mean(f0_values))
            features.f0_std = float(np.std(f0_values))
            features.vocal_tremor = _compute_vocal_tremor(f0_values)
            self.state.f0_history.extend(f0_values.tolist())

        features.silence_ratio = _compute_silence_ratio(audio, sr)

        feature_vector = np.array([
            features.speech_rate,
            features.vocal_tremor,
            features.f0_mean,
            features.f0_std,
            features.silence_ratio,
            features.energy_mean,
        ])
        features.arousal, features.valence = self._predict_arousal_valence(feature_vector)

        return features

    def compute_fatigue_score(
        self,
        features: AudioFeatures,
        baseline_f0: float = 120.0,
        baseline_speech_rate: float = 3.5,
    ) -> float:
        """Compute audio-modality fatigue sub-score (0-100)."""
        if not features.has_speech:
            if features.silence_ratio > 0.9:
                return 30.0
            return 50.0

        f0_drop = max(0.0, baseline_f0 - features.f0_mean) / max(baseline_f0, 1.0)
        f0_score = min(f0_drop * 60, 25.0)

        speech_drop = max(0.0, baseline_speech_rate - features.speech_rate) / max(baseline_speech_rate, 0.1)
        speech_score = min(speech_drop * 40, 20.0)

        tremor_score = min(features.vocal_tremor * 200, 25.0)

        silence_score = 0.0
        if features.silence_ratio > 0.5:
            silence_score = min((features.silence_ratio - 0.5) * 40, 15.0)

        arousal_penalty = 0.0
        if features.arousal < 0.3:
            arousal_penalty = (0.3 - features.arousal) * 30

        total = f0_score + speech_score + tremor_score + silence_score + arousal_penalty
        return float(min(max(total, 0.0), 100.0))
