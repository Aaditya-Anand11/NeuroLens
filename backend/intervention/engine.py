"""Intervention engine: rule-based fast alerts + Gemini LLM contextual suggestions.

Rules trigger immediate alerts for critical thresholds.
Gemini generates personalized, context-aware intervention messages
when CLI crosses 70+.
"""

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-1.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

INTERVENTION_COOLDOWN_SECONDS = 300
CLI_LLM_THRESHOLD = 70
CLI_CRITICAL_THRESHOLD = 85


@dataclass
class InterventionContext:
    cli_score: float = 0.0
    fatigue_stage: str = "alert"
    session_duration_minutes: float = 0.0
    vision_score: float = 0.0
    eye_score: float = 0.0
    biometric_score: float = 0.0
    audio_score: float = 0.0
    blink_rate: float = 0.0
    perclos: float = 0.0
    typing_speed: float = 0.0
    microsleep_detected: bool = False
    time_of_day: str = ""
    intervention_count: int = 0
    dominant_expression: str = "neutral"


@dataclass
class InterventionResult:
    should_intervene: bool = False
    message: str = ""
    intervention_type: str = ""
    trigger_modality: str = ""
    severity: str = "info"
    generated_by: str = "none"


RULE_DEFINITIONS = [
    {
        "name": "microsleep_alert",
        "condition": lambda ctx: ctx.microsleep_detected,
        "message": "Microsleep detected! You briefly closed your eyes for an extended period. Please take an immediate break — stand up, splash water on your face, or step outside for fresh air.",
        "type": "immediate_break",
        "modality": "eye",
        "severity": "critical",
    },
    {
        "name": "critical_fatigue",
        "condition": lambda ctx: ctx.cli_score >= CLI_CRITICAL_THRESHOLD,
        "message": "Your cognitive load is critically high ({cli:.0f}/100). Multiple fatigue indicators are elevated. Stop working immediately and take at least a 15-minute break.",
        "type": "mandatory_break",
        "modality": "fusion",
        "severity": "critical",
    },
    {
        "name": "high_perclos",
        "condition": lambda ctx: ctx.perclos > 0.15,
        "message": "Your eyes have been closed {perclos:.0%} of the last minute — a strong sign of drowsiness. Try the 20-20-20 rule: look at something 20 feet away for 20 seconds.",
        "type": "eye_rest",
        "modality": "vision",
        "severity": "high",
    },
    {
        "name": "low_blink_rate",
        "condition": lambda ctx: ctx.blink_rate < 8 and ctx.session_duration_minutes > 10,
        "message": "Your blink rate dropped to {blink:.0f}/min (normal: 15-20). Screen fixation is straining your eyes. Blink deliberately 10 times and look away from the screen.",
        "type": "eye_exercise",
        "modality": "vision",
        "severity": "medium",
    },
    {
        "name": "typing_degradation",
        "condition": lambda ctx: ctx.typing_speed < 30 and ctx.biometric_score > 60,
        "message": "Your typing speed has dropped significantly and error rate is up. This often indicates mental fatigue. Consider switching to a less demanding task.",
        "type": "task_switch",
        "modality": "biometric",
        "severity": "medium",
    },
    {
        "name": "long_session",
        "condition": lambda ctx: ctx.session_duration_minutes > 90 and ctx.cli_score > 50,
        "message": "You've been working for {duration:.0f} minutes without a break. The Pomodoro technique suggests 25-minute sprints. Take a 5-minute walk.",
        "type": "scheduled_break",
        "modality": "time",
        "severity": "medium",
    },
]


class InterventionEngine:
    """Hybrid intervention engine: rule-based + Gemini LLM."""

    def __init__(self):
        self.last_intervention_time: float = 0.0
        self.intervention_count: int = 0
        self.rule_cooldowns: dict[str, float] = {}

    def _check_cooldown(self) -> bool:
        """Check if enough time has passed since last intervention."""
        return (time.time() - self.last_intervention_time) >= INTERVENTION_COOLDOWN_SECONDS

    def _check_rule_cooldown(self, rule_name: str, cooldown: float = 120.0) -> bool:
        """Check per-rule cooldown."""
        last = self.rule_cooldowns.get(rule_name, 0.0)
        return (time.time() - last) >= cooldown

    def _evaluate_rules(self, context: InterventionContext) -> Optional[InterventionResult]:
        """Evaluate all rules against current context, return first match."""
        for rule in RULE_DEFINITIONS:
            if not self._check_rule_cooldown(rule["name"]):
                continue
            if rule["condition"](context):
                msg = rule["message"].format(
                    cli=context.cli_score,
                    perclos=context.perclos,
                    blink=context.blink_rate,
                    duration=context.session_duration_minutes,
                )
                self.rule_cooldowns[rule["name"]] = time.time()
                return InterventionResult(
                    should_intervene=True,
                    message=msg,
                    intervention_type=rule["type"],
                    trigger_modality=rule["modality"],
                    severity=rule["severity"],
                    generated_by="rules",
                )
        return None

    async def _generate_llm_intervention(self, context: InterventionContext) -> Optional[InterventionResult]:
        """Generate a personalized intervention using Gemini 1.5 Flash."""
        if not GEMINI_API_KEY:
            return self._fallback_llm_response(context)

        hour = datetime.now(timezone.utc).hour
        time_context = "morning" if 5 <= hour < 12 else "afternoon" if 12 <= hour < 17 else "evening" if 17 <= hour < 21 else "late night"

        prompt = f"""You are a wellness assistant in a cognitive fatigue detection system called NeuroLens.
The user has been working and their fatigue metrics indicate they need an intervention.

Current metrics:
- Cognitive Load Index (CLI): {context.cli_score:.1f}/100 ({context.fatigue_stage})
- Session duration: {context.session_duration_minutes:.0f} minutes
- Vision fatigue score: {context.vision_score:.1f}/100
- Eye tracking score: {context.eye_score:.1f}/100
- Behavioral biometrics score: {context.biometric_score:.1f}/100
- Audio stress score: {context.audio_score:.1f}/100
- Blink rate: {context.blink_rate:.1f}/min
- Eye closure (PERCLOS): {context.perclos:.1%}
- Current typing speed: {context.typing_speed:.0f} WPM
- Facial expression: {context.dominant_expression}
- Time of day: {time_context}
- Previous interventions this session: {context.intervention_count}

Generate a brief, empathetic, actionable intervention message (2-3 sentences max).
Reference specific metrics that are concerning. Suggest a concrete action
(breathing exercise, movement, hydration, task switch, etc.).
Do not be preachy or condescending. Be specific about what you observed."""

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{GEMINI_URL}?key={GEMINI_API_KEY}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 200,
                        },
                    },
                )
                if response.status_code != 200:
                    return self._fallback_llm_response(context)

                data = response.json()
                text = data["candidates"][0]["content"]["parts"][0]["text"]

                dominant = max(
                    [("vision", context.vision_score), ("eye", context.eye_score),
                     ("biometric", context.biometric_score), ("audio", context.audio_score)],
                    key=lambda x: x[1],
                )

                return InterventionResult(
                    should_intervene=True,
                    message=text.strip(),
                    intervention_type="personalized_suggestion",
                    trigger_modality=dominant[0],
                    severity="high" if context.cli_score >= 80 else "medium",
                    generated_by="gemini",
                )
        except Exception:
            return self._fallback_llm_response(context)

    def _fallback_llm_response(self, context: InterventionContext) -> InterventionResult:
        """Generate a fallback intervention when Gemini is unavailable."""
        dominant = max(
            [("vision", context.vision_score), ("eye", context.eye_score),
             ("biometric", context.biometric_score), ("audio", context.audio_score)],
            key=lambda x: x[1],
        )

        messages = {
            "vision": f"Your facial indicators show significant fatigue (score: {context.vision_score:.0f}/100). "
                      f"You've been focused for {context.session_duration_minutes:.0f} minutes. "
                      "Try the 4-7-8 breathing technique: inhale for 4s, hold for 7s, exhale for 8s.",
            "eye": f"Your eye-tracking patterns indicate strain (score: {context.eye_score:.0f}/100). "
                   f"Your blink rate is {context.blink_rate:.0f}/min. "
                   "Look away from the screen at a distant object for 30 seconds.",
            "biometric": f"Your typing and mouse patterns show cognitive decline (score: {context.biometric_score:.0f}/100). "
                         "Consider switching to a simpler task or taking a short walk.",
            "audio": f"Your voice patterns indicate stress (score: {context.audio_score:.0f}/100). "
                     "Take 5 deep breaths and drink some water.",
        }

        return InterventionResult(
            should_intervene=True,
            message=messages.get(dominant[0], "Time for a break. Step away from the screen for 5 minutes."),
            intervention_type="fallback_suggestion",
            trigger_modality=dominant[0],
            severity="high" if context.cli_score >= 80 else "medium",
            generated_by="fallback",
        )

    async def evaluate(self, context: InterventionContext) -> InterventionResult:
        """Evaluate context and determine if an intervention is needed."""
        if context.fatigue_stage == "alert":
            return InterventionResult(should_intervene=False)

        rule_result = self._evaluate_rules(context)
        if rule_result is not None and rule_result.severity == "critical":
            self.last_intervention_time = time.time()
            self.intervention_count += 1
            return rule_result

        if not self._check_cooldown():
            return InterventionResult(should_intervene=False)

        if rule_result is not None:
            self.last_intervention_time = time.time()
            self.intervention_count += 1
            return rule_result

        if context.cli_score >= CLI_LLM_THRESHOLD:
            llm_result = await self._generate_llm_intervention(context)
            if llm_result is not None:
                self.last_intervention_time = time.time()
                self.intervention_count += 1
                return llm_result

        return InterventionResult(should_intervene=False)

    def reset(self):
        """Reset engine state for a new session."""
        self.last_intervention_time = 0.0
        self.intervention_count = 0
        self.rule_cooldowns.clear()
