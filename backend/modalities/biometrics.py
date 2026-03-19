"""Behavioral biometrics: keystroke dynamics and mouse movement analysis.

Keystroke dynamics:
- Dwell time (key press duration)
- Flight time (inter-key interval)
- Error rate (backspace/delete frequency)
- Typing rhythm entropy (Shannon entropy of inter-key intervals)

Mouse movement:
- Jitter (high-frequency positional noise)
- Velocity decay (decreasing movement speed over time)
- Fitts' Law deviation scoring (actual vs predicted movement time)
"""

import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class KeystrokeFeatures:
    avg_dwell_time: float = 0.0
    avg_flight_time: float = 0.0
    typing_speed_wpm: float = 0.0
    error_rate: float = 0.0
    rhythm_entropy: float = 0.0
    total_keys: int = 0
    total_errors: int = 0


@dataclass
class MouseFeatures:
    avg_velocity: float = 0.0
    jitter: float = 0.0
    velocity_decay_rate: float = 0.0
    fitts_deviation: float = 0.0
    click_count: int = 0
    total_distance: float = 0.0


@dataclass
class BiometricFeatures:
    keystroke: KeystrokeFeatures = field(default_factory=KeystrokeFeatures)
    mouse: MouseFeatures = field(default_factory=MouseFeatures)
    has_keystroke_data: bool = False
    has_mouse_data: bool = False


@dataclass
class KeyEvent:
    key: str
    event_type: str  # "down" or "up"
    timestamp: float


@dataclass
class MouseEvent:
    x: float
    y: float
    timestamp: float
    event_type: str  # "move", "click"
    button: Optional[str] = None


ANALYSIS_WINDOW_SECONDS = 120
ERROR_KEYS = {"Backspace", "Delete"}


def _shannon_entropy(intervals: list[float]) -> float:
    """Compute Shannon entropy of binned inter-key intervals."""
    if len(intervals) < 3:
        return 0.0
    arr = [max(0.001, v) for v in intervals]
    min_val = min(arr)
    max_val = max(arr)
    if max_val - min_val < 0.001:
        return 0.0
    n_bins = min(20, len(arr) // 2 + 1)
    bin_width = (max_val - min_val) / n_bins
    bins = [0] * n_bins
    for v in arr:
        idx = min(int((v - min_val) / bin_width), n_bins - 1)
        bins[idx] += 1
    total = sum(bins)
    entropy = 0.0
    for count in bins:
        if count > 0:
            p = count / total
            entropy -= p * math.log2(p)
    return entropy


def _fitts_predicted_time(distance: float, target_width: float = 50.0) -> float:
    """Compute Fitts' Law predicted movement time (seconds).

    MT = a + b * log2(2D/W)
    Using standard coefficients: a=0.05, b=0.15
    """
    if distance < 1.0:
        return 0.05
    index_of_difficulty = math.log2(2.0 * distance / target_width + 1.0)
    return 0.05 + 0.15 * index_of_difficulty


class BiometricsAnalyzer:
    """Real-time keystroke dynamics and mouse movement analysis."""

    def __init__(self):
        self.key_events: deque[KeyEvent] = deque(maxlen=5000)
        self.key_down_times: dict[str, float] = {}
        self.mouse_events: deque[MouseEvent] = deque(maxlen=5000)
        self.click_events: deque[MouseEvent] = deque(maxlen=1000)
        self.velocity_history: deque[tuple[float, float]] = deque(maxlen=1000)

    def record_key_event(self, key: str, event_type: str, timestamp: Optional[float] = None):
        """Record a keyboard event (keydown or keyup)."""
        ts = timestamp if timestamp is not None else time.time()
        self.key_events.append(KeyEvent(key=key, event_type=event_type, timestamp=ts))
        if event_type == "down":
            self.key_down_times[key] = ts
        elif event_type == "up" and key in self.key_down_times:
            del self.key_down_times[key]

    def record_mouse_event(
        self, x: float, y: float, event_type: str,
        button: Optional[str] = None, timestamp: Optional[float] = None,
    ):
        """Record a mouse event (move or click)."""
        ts = timestamp if timestamp is not None else time.time()
        evt = MouseEvent(x=x, y=y, timestamp=ts, event_type=event_type, button=button)
        self.mouse_events.append(evt)
        if event_type == "click":
            self.click_events.append(evt)

    def analyze(self) -> BiometricFeatures:
        """Analyze accumulated keystroke and mouse events."""
        features = BiometricFeatures()
        now = time.time()
        cutoff = now - ANALYSIS_WINDOW_SECONDS

        features.keystroke = self._analyze_keystrokes(cutoff)
        features.has_keystroke_data = features.keystroke.total_keys > 5
        features.mouse = self._analyze_mouse(cutoff)
        features.has_mouse_data = features.mouse.total_distance > 10.0

        return features

    def _analyze_keystrokes(self, cutoff: float) -> KeystrokeFeatures:
        """Analyze keystroke dynamics within the analysis window."""
        kf = KeystrokeFeatures()
        recent_events = [e for e in self.key_events if e.timestamp >= cutoff]
        if len(recent_events) < 3:
            return kf

        down_events = [e for e in recent_events if e.event_type == "down"]
        up_events = {e.key: e.timestamp for e in recent_events if e.event_type == "up"}
        down_map = {}
        for e in recent_events:
            if e.event_type == "down":
                down_map[e.key] = e.timestamp

        dwell_times = []
        for e in recent_events:
            if e.event_type == "down" and e.key in up_events:
                dwell = up_events[e.key] - e.timestamp
                if 0.01 < dwell < 2.0:
                    dwell_times.append(dwell)

        if dwell_times:
            kf.avg_dwell_time = sum(dwell_times) / len(dwell_times)

        flight_times = []
        sorted_downs = sorted(down_events, key=lambda e: e.timestamp)
        for i in range(1, len(sorted_downs)):
            flight = sorted_downs[i].timestamp - sorted_downs[i - 1].timestamp
            if 0.01 < flight < 5.0:
                flight_times.append(flight)

        if flight_times:
            kf.avg_flight_time = sum(flight_times) / len(flight_times)
            kf.rhythm_entropy = _shannon_entropy(flight_times)

        kf.total_keys = len(down_events)
        kf.total_errors = sum(1 for e in down_events if e.key in ERROR_KEYS)
        kf.error_rate = kf.total_errors / max(kf.total_keys, 1)

        if flight_times:
            elapsed = max(recent_events[-1].timestamp - recent_events[0].timestamp, 1.0)
            chars = kf.total_keys - kf.total_errors
            kf.typing_speed_wpm = (chars / 5.0) / (elapsed / 60.0)

        return kf

    def _analyze_mouse(self, cutoff: float) -> MouseFeatures:
        """Analyze mouse movement within the analysis window."""
        mf = MouseFeatures()
        recent_moves = [
            e for e in self.mouse_events
            if e.timestamp >= cutoff and e.event_type == "move"
        ]

        if len(recent_moves) < 5:
            return mf

        velocities = []
        distances = []
        total_dist = 0.0

        for i in range(1, len(recent_moves)):
            dx = recent_moves[i].x - recent_moves[i - 1].x
            dy = recent_moves[i].y - recent_moves[i - 1].y
            dist = math.sqrt(dx * dx + dy * dy)
            dt = recent_moves[i].timestamp - recent_moves[i - 1].timestamp
            total_dist += dist
            distances.append(dist)
            if dt > 0.001:
                velocities.append(dist / dt)

        mf.total_distance = total_dist

        if velocities:
            mf.avg_velocity = sum(velocities) / len(velocities)

            half = len(velocities) // 2
            if half > 2:
                first_half_avg = sum(velocities[:half]) / half
                second_half_avg = sum(velocities[half:]) / (len(velocities) - half)
                if first_half_avg > 1.0:
                    mf.velocity_decay_rate = max(0.0, (first_half_avg - second_half_avg) / first_half_avg)

        jitter_values = []
        window_size = 5
        for i in range(window_size, len(recent_moves)):
            window_x = [recent_moves[j].x for j in range(i - window_size, i)]
            window_y = [recent_moves[j].y for j in range(i - window_size, i)]
            mean_x = sum(window_x) / window_size
            mean_y = sum(window_y) / window_size
            var_x = sum((x - mean_x) ** 2 for x in window_x) / window_size
            var_y = sum((y - mean_y) ** 2 for y in window_y) / window_size
            jitter_values.append(math.sqrt(var_x + var_y))

        if jitter_values:
            mf.jitter = sum(jitter_values) / len(jitter_values)

        recent_clicks = [e for e in self.click_events if e.timestamp >= cutoff]
        mf.click_count = len(recent_clicks)

        fitts_deviations = []
        for i in range(1, len(recent_clicks)):
            dx = recent_clicks[i].x - recent_clicks[i - 1].x
            dy = recent_clicks[i].y - recent_clicks[i - 1].y
            dist = math.sqrt(dx * dx + dy * dy)
            dt = recent_clicks[i].timestamp - recent_clicks[i - 1].timestamp
            if dist > 5.0 and dt > 0.05:
                predicted = _fitts_predicted_time(dist)
                deviation = abs(dt - predicted) / max(predicted, 0.01)
                fitts_deviations.append(deviation)

        if fitts_deviations:
            mf.fitts_deviation = sum(fitts_deviations) / len(fitts_deviations)

        return mf

    def compute_fatigue_score(
        self,
        features: BiometricFeatures,
        baseline_typing_speed: float = 60.0,
        baseline_typing_entropy: float = 1.5,
        baseline_mouse_jitter: float = 2.0,
    ) -> float:
        """Compute behavioral biometrics fatigue sub-score (0-100)."""
        score = 0.0
        weight_total = 0.0

        if features.has_keystroke_data:
            ks = features.keystroke
            speed_drop = max(0.0, baseline_typing_speed - ks.typing_speed_wpm) / max(baseline_typing_speed, 1.0)
            speed_score = min(speed_drop * 50, 25.0)

            entropy_change = abs(ks.rhythm_entropy - baseline_typing_entropy) / max(baseline_typing_entropy, 0.01)
            entropy_score = min(entropy_change * 20, 20.0)

            error_score = min(ks.error_rate * 200, 20.0)

            dwell_score = 0.0
            if ks.avg_dwell_time > 0.15:
                dwell_score = min((ks.avg_dwell_time - 0.15) * 100, 15.0)

            score += speed_score + entropy_score + error_score + dwell_score
            weight_total += 1.0

        if features.has_mouse_data:
            ms = features.mouse
            jitter_excess = max(0.0, ms.jitter - baseline_mouse_jitter) / max(baseline_mouse_jitter, 0.01)
            jitter_score = min(jitter_excess * 30, 25.0)

            decay_score = min(ms.velocity_decay_rate * 40, 20.0)

            fitts_score = min(ms.fitts_deviation * 15, 20.0)

            score += jitter_score + decay_score + fitts_score
            weight_total += 1.0

        if weight_total == 0:
            return 50.0

        normalized = score / weight_total
        return float(min(max(normalized, 0.0), 100.0))
