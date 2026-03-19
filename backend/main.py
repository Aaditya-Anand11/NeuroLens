"""FastAPI entrypoint with WebSocket server for real-time fatigue streaming and REST API.

Endpoints:
- WebSocket /ws/fatigue — streams real-time CLI scores and modality data
- POST /api/calibrate — start/complete calibration session
- GET /api/session — list sessions or get active session
- GET /api/fatigue/history — fatigue timeline for a session
- GET /api/interventions — intervention log
- POST /api/session/start — start a new monitoring session
- POST /api/session/stop — stop the active session
"""

import asyncio
import base64
import json
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from neurolens.backend.database.models import (
    Base, engine, get_db, init_db, User, CalibrationProfile,
    Session as SessionModel, FatigueRecord, Intervention,
)
from neurolens.backend.modalities.face_vision import FaceVisionAnalyzer
from neurolens.backend.modalities.eye_tracking import EyeTrackingAnalyzer
from neurolens.backend.modalities.biometrics import BiometricsAnalyzer
from neurolens.backend.modalities.audio_stress import AudioStressAnalyzer
from neurolens.backend.fusion.ensemble import FusionEnsemble
from neurolens.backend.intervention.engine import InterventionEngine, InterventionContext
from neurolens.backend.utils.calibration import CalibrationSession


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    db = next(get_db())
    user = db.query(User).filter(User.username == "default").first()
    if not user:
        user = User(username="default")
        db.add(user)
        db.commit()
    db.close()
    yield


app = FastAPI(
    title="NeuroLens API",
    description="Multimodal Cognitive Fatigue & Mental Overload Detection System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

face_analyzer = FaceVisionAnalyzer()
eye_analyzer = EyeTrackingAnalyzer()
biometrics_analyzer = BiometricsAnalyzer()
audio_analyzer = AudioStressAnalyzer()
fusion_engine = FusionEnsemble()
intervention_engine = InterventionEngine()
calibration_session = CalibrationSession()

active_session_id: Optional[int] = None
session_start_time: Optional[float] = None


class SessionStartRequest(BaseModel):
    user_id: int = 1


class SessionStopRequest(BaseModel):
    session_id: Optional[int] = None


class CalibrateRequest(BaseModel):
    action: str  # "start" or "status" or "complete"
    user_id: int = 1


class BiometricEvent(BaseModel):
    event_type: str  # "key_down", "key_up", "mouse_move", "mouse_click"
    key: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    button: Optional[str] = None
    timestamp: Optional[float] = None


class WipeRequest(BaseModel):
    user_id: int = 1
    confirm: bool = False


# --- REST Endpoints ---

@app.post("/api/session/start")
def start_session(req: SessionStartRequest, db: DBSession = Depends(get_db)):
    global active_session_id, session_start_time
    if active_session_id is not None:
        existing = db.query(SessionModel).filter(SessionModel.id == active_session_id).first()
        if existing and existing.is_active:
            raise HTTPException(status_code=400, detail="A session is already active")

    session = SessionModel(user_id=req.user_id, is_active=True)
    db.add(session)
    db.commit()
    db.refresh(session)
    active_session_id = session.id
    session_start_time = time.time()
    fusion_engine.reset()
    intervention_engine.reset()
    return {
        "session_id": session.id,
        "started_at": session.started_at.isoformat(),
        "status": "active",
    }


@app.post("/api/session/stop")
def stop_session(req: SessionStopRequest, db: DBSession = Depends(get_db)):
    global active_session_id, session_start_time
    sid = req.session_id or active_session_id
    if sid is None:
        raise HTTPException(status_code=404, detail="No active session")

    session = db.query(SessionModel).filter(SessionModel.id == sid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_active = False
    session.ended_at = datetime.now(timezone.utc)

    records = db.query(FatigueRecord).filter(FatigueRecord.session_id == sid).all()
    if records:
        cli_scores = [r.cli_score for r in records]
        session.average_cli = sum(cli_scores) / len(cli_scores)
        session.peak_cli = max(cli_scores)
    session.total_interventions = db.query(Intervention).filter(Intervention.session_id == sid).count()

    db.commit()
    active_session_id = None
    session_start_time = None
    return {
        "session_id": session.id,
        "ended_at": session.ended_at.isoformat(),
        "average_cli": session.average_cli,
        "peak_cli": session.peak_cli,
        "total_interventions": session.total_interventions,
    }


@app.get("/api/session")
def get_sessions(
    user_id: int = Query(default=1),
    active_only: bool = Query(default=False),
    limit: int = Query(default=20),
    db: DBSession = Depends(get_db),
):
    query = db.query(SessionModel).filter(SessionModel.user_id == user_id)
    if active_only:
        query = query.filter(SessionModel.is_active == True)
    sessions = query.order_by(SessionModel.started_at.desc()).limit(limit).all()
    return [
        {
            "id": s.id,
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "is_active": s.is_active,
            "average_cli": s.average_cli,
            "peak_cli": s.peak_cli,
            "total_interventions": s.total_interventions,
        }
        for s in sessions
    ]


@app.get("/api/fatigue/history")
def get_fatigue_history(
    session_id: int = Query(...),
    db: DBSession = Depends(get_db),
):
    records = (
        db.query(FatigueRecord)
        .filter(FatigueRecord.session_id == session_id)
        .order_by(FatigueRecord.timestamp)
        .all()
    )
    return [
        {
            "timestamp": r.timestamp.isoformat(),
            "cli_score": r.cli_score,
            "fatigue_stage": r.fatigue_stage,
            "vision_score": r.vision_score,
            "eye_score": r.eye_score,
            "biometric_score": r.biometric_score,
            "audio_score": r.audio_score,
        }
        for r in records
    ]


@app.get("/api/interventions")
def get_interventions(
    session_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50),
    db: DBSession = Depends(get_db),
):
    query = db.query(Intervention)
    if session_id is not None:
        query = query.filter(Intervention.session_id == session_id)
    interventions = query.order_by(Intervention.triggered_at.desc()).limit(limit).all()
    return [
        {
            "id": i.id,
            "session_id": i.session_id,
            "triggered_at": i.triggered_at.isoformat(),
            "trigger_cli": i.trigger_cli,
            "trigger_stage": i.trigger_stage,
            "trigger_modality": i.trigger_modality,
            "message": i.message,
            "intervention_type": i.intervention_type,
            "was_dismissed": i.was_dismissed,
        }
        for i in interventions
    ]


@app.post("/api/calibrate")
def calibrate(req: CalibrateRequest, db: DBSession = Depends(get_db)):
    if req.action == "start":
        calibration_session.start()
        return {"status": "started", "duration": 60}
    elif req.action == "status":
        return calibration_session.get_progress()
    elif req.action == "complete":
        if not calibration_session.is_complete:
            return {"status": "not_complete", "progress": calibration_session.get_progress()}
        result = calibration_session.get_result()
        profile = db.query(CalibrationProfile).filter(CalibrationProfile.user_id == req.user_id).first()
        if profile is None:
            profile = CalibrationProfile(user_id=req.user_id)
            db.add(profile)
        profile.baseline_blink_rate = result.baseline_blink_rate
        profile.baseline_perclos = result.baseline_perclos
        profile.baseline_typing_speed = result.baseline_typing_speed
        profile.baseline_typing_entropy = result.baseline_typing_entropy
        profile.baseline_mouse_jitter = result.baseline_mouse_jitter
        profile.baseline_gaze_stability = result.baseline_gaze_stability
        profile.baseline_f0_mean = result.baseline_f0_mean
        profile.baseline_speech_rate = result.baseline_speech_rate
        profile.calibrated_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "status": "calibrated",
            "baselines": {
                "blink_rate": result.baseline_blink_rate,
                "perclos": result.baseline_perclos,
                "typing_speed": result.baseline_typing_speed,
                "typing_entropy": result.baseline_typing_entropy,
                "mouse_jitter": result.baseline_mouse_jitter,
                "gaze_stability": result.baseline_gaze_stability,
                "f0_mean": result.baseline_f0_mean,
                "speech_rate": result.baseline_speech_rate,
            },
            "is_valid": result.is_valid,
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use: start, status, complete")


@app.post("/api/biometric/event")
def record_biometric_event(event: BiometricEvent):
    ts = event.timestamp or time.time()
    if event.event_type in ("key_down", "key_up"):
        biometrics_analyzer.record_key_event(
            key=event.key or "", event_type=event.event_type.replace("key_", ""), timestamp=ts,
        )
    elif event.event_type == "mouse_move":
        biometrics_analyzer.record_mouse_event(
            x=event.x or 0, y=event.y or 0, event_type="move", timestamp=ts,
        )
    elif event.event_type == "mouse_click":
        biometrics_analyzer.record_mouse_event(
            x=event.x or 0, y=event.y or 0, event_type="click", button=event.button, timestamp=ts,
        )
    return {"status": "recorded"}


@app.post("/api/privacy/wipe")
def wipe_data(req: WipeRequest, db: DBSession = Depends(get_db)):
    if not req.confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to wipe all session data")
    db.query(FatigueRecord).filter(
        FatigueRecord.session_id.in_(
            db.query(SessionModel.id).filter(SessionModel.user_id == req.user_id)
        )
    ).delete(synchronize_session=False)
    db.query(Intervention).filter(
        Intervention.session_id.in_(
            db.query(SessionModel.id).filter(SessionModel.user_id == req.user_id)
        )
    ).delete(synchronize_session=False)
    db.query(SessionModel).filter(SessionModel.user_id == req.user_id).delete()
    db.query(CalibrationProfile).filter(CalibrationProfile.user_id == req.user_id).delete()
    db.commit()
    return {"status": "wiped", "user_id": req.user_id}


# --- WebSocket Endpoint ---

def _get_baselines(db: DBSession, user_id: int = 1) -> dict:
    """Retrieve calibration baselines for a user, using defaults if not calibrated."""
    profile = db.query(CalibrationProfile).filter(CalibrationProfile.user_id == user_id).first()
    if profile:
        return {
            "blink_rate": profile.baseline_blink_rate,
            "perclos": profile.baseline_perclos,
            "typing_speed": profile.baseline_typing_speed,
            "typing_entropy": profile.baseline_typing_entropy,
            "mouse_jitter": profile.baseline_mouse_jitter,
            "gaze_stability": profile.baseline_gaze_stability,
            "f0_mean": profile.baseline_f0_mean,
            "speech_rate": profile.baseline_speech_rate,
        }
    return {
        "blink_rate": 15.0, "perclos": 0.05, "typing_speed": 60.0,
        "typing_entropy": 1.5, "mouse_jitter": 2.0, "gaze_stability": 0.9,
        "f0_mean": 120.0, "speech_rate": 3.5,
    }


@app.websocket("/ws/fatigue")
async def websocket_fatigue(websocket: WebSocket):
    """WebSocket endpoint streaming real-time fatigue analysis.

    Client sends JSON with:
    - "frame": base64-encoded JPEG frame from webcam
    - "audio" (optional): base64-encoded PCM float32 audio chunk
    - "biometric_events" (optional): list of biometric events
    """
    await websocket.accept()
    db = next(get_db())
    baselines = _get_baselines(db)
    db.close()

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            frame = None
            if "frame" in data:
                frame_bytes = base64.b64decode(data["frame"])
                nparr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            audio_chunk = None
            if "audio" in data:
                audio_bytes = base64.b64decode(data["audio"])
                audio_chunk = np.frombuffer(audio_bytes, dtype=np.float32)

            if "biometric_events" in data:
                for evt in data["biometric_events"]:
                    ts = evt.get("timestamp", time.time())
                    if evt["event_type"] in ("key_down", "key_up"):
                        biometrics_analyzer.record_key_event(
                            key=evt.get("key", ""), event_type=evt["event_type"].replace("key_", ""), timestamp=ts,
                        )
                    elif evt["event_type"] == "mouse_move":
                        biometrics_analyzer.record_mouse_event(
                            x=evt.get("x", 0), y=evt.get("y", 0), event_type="move", timestamp=ts,
                        )
                    elif evt["event_type"] == "mouse_click":
                        biometrics_analyzer.record_mouse_event(
                            x=evt.get("x", 0), y=evt.get("y", 0), event_type="click",
                            button=evt.get("button"), timestamp=ts,
                        )

            # --- Analyze all modalities ---
            # Vision: extract face landmarks once, reuse for eye tracking
            vision_features = face_analyzer.analyze_frame(frame) if frame is not None else None
            has_vision = vision_features is not None and vision_features.landmarks_detected
            vision_score = face_analyzer.compute_fatigue_score(
                vision_features, baselines["blink_rate"], baselines["perclos"],
            ) if has_vision else None

            # Eye tracking: reuse face landmarks from vision pass (no duplicate FaceMesh)
            avg_ear = 0.3
            if has_vision:
                avg_ear = (vision_features.left_ear + vision_features.right_ear) / 2.0
            if has_vision and vision_features.raw_face_landmarks is not None:
                eye_features = eye_analyzer.analyze_landmarks(
                    vision_features.raw_face_landmarks,
                    vision_features.frame_width,
                    vision_features.frame_height,
                    avg_ear,
                )
            elif frame is not None:
                eye_features = eye_analyzer.analyze_frame(frame, avg_ear)
            else:
                eye_features = None
            has_eye = eye_features is not None and eye_features.gaze_available
            eye_score = eye_analyzer.compute_fatigue_score(
                eye_features, baselines["gaze_stability"],
            ) if has_eye else None

            # Biometrics: always available (keyboard/mouse events buffered)
            bio_features = biometrics_analyzer.analyze()
            has_bio = bio_features.has_keystroke_data or bio_features.has_mouse_data
            bio_score = biometrics_analyzer.compute_fatigue_score(
                bio_features, baselines["typing_speed"], baselines["typing_entropy"], baselines["mouse_jitter"],
            ) if has_bio else None

            # Audio: only score when speech is detected
            audio_features = audio_analyzer.analyze_chunk(audio_chunk) if audio_chunk is not None else None
            has_audio = audio_features is not None and audio_features.has_speech
            audio_score = audio_analyzer.compute_fatigue_score(
                audio_features, baselines["f0_mean"], baselines["speech_rate"],
            ) if has_audio else None

            if calibration_session.is_running:
                if vision_features:
                    calibration_session.add_vision_sample(vision_features)
                if eye_features:
                    calibration_session.add_eye_tracking_sample(eye_features)
                calibration_session.add_biometric_sample(bio_features)
                if audio_features:
                    calibration_session.add_audio_sample(audio_features)
                progress = calibration_session.tick()
                await websocket.send_json({
                    "type": "calibration",
                    "progress": progress,
                    "status": calibration_session.get_progress(),
                })
                continue

            # Use None-aware fusion: only fuse modalities that have real data
            fusion_result = fusion_engine.fuse(
                vision_score if vision_score is not None else None,
                eye_score if eye_score is not None else None,
                bio_score if bio_score is not None else None,
                audio_score if audio_score is not None else None,
            )
            # For display, show 0.0 for inactive modalities
            vision_score = vision_score if vision_score is not None else 0.0
            eye_score = eye_score if eye_score is not None else 0.0
            bio_score = bio_score if bio_score is not None else 0.0
            audio_score = audio_score if audio_score is not None else 0.0

            if active_session_id is not None:
                db = next(get_db())
                record = FatigueRecord(
                    session_id=active_session_id,
                    cli_score=fusion_result.cli_score,
                    fatigue_stage=fusion_result.fatigue_stage,
                    vision_score=vision_score,
                    eye_score=eye_score,
                    biometric_score=bio_score,
                    audio_score=audio_score,
                    raw_features={
                        "blink_rate": vision_features.blink_rate if vision_features else 0,
                        "perclos": vision_features.perclos if vision_features else 0,
                        "gaze_stability": eye_features.fixation_stability if eye_features else 0,
                        "typing_wpm": bio_features.keystroke.typing_speed_wpm if bio_features.has_keystroke_data else 0,
                    },
                )
                db.add(record)
                db.commit()
                db.close()

            elapsed = (time.time() - session_start_time) / 60.0 if session_start_time else 0.0
            ctx = InterventionContext(
                cli_score=fusion_result.cli_score,
                fatigue_stage=fusion_result.fatigue_stage,
                session_duration_minutes=elapsed,
                vision_score=vision_score,
                eye_score=eye_score,
                biometric_score=bio_score,
                audio_score=audio_score,
                blink_rate=vision_features.blink_rate if vision_features else 0,
                perclos=vision_features.perclos if vision_features else 0,
                typing_speed=bio_features.keystroke.typing_speed_wpm if bio_features.has_keystroke_data else 0,
                microsleep_detected=eye_features.microsleep_detected if eye_features else False,
                time_of_day=datetime.now().strftime("%H:%M"),
                intervention_count=intervention_engine.intervention_count,
                dominant_expression=vision_features.dominant_expression if vision_features else "neutral",
            )
            intervention_result = await intervention_engine.evaluate(ctx)

            intervention_data = None
            if intervention_result.should_intervene:
                intervention_data = {
                    "message": intervention_result.message,
                    "type": intervention_result.intervention_type,
                    "modality": intervention_result.trigger_modality,
                    "severity": intervention_result.severity,
                    "generated_by": intervention_result.generated_by,
                }
                if active_session_id is not None:
                    db = next(get_db())
                    intervention_record = Intervention(
                        session_id=active_session_id,
                        trigger_cli=fusion_result.cli_score,
                        trigger_stage=fusion_result.fatigue_stage,
                        trigger_modality=intervention_result.trigger_modality,
                        message=intervention_result.message,
                        intervention_type=intervention_result.intervention_type,
                    )
                    db.add(intervention_record)
                    db.commit()
                    db.close()

            response = {
                "type": "fatigue_update",
                "cli_score": fusion_result.cli_score,
                "fatigue_stage": fusion_result.fatigue_stage,
                "confidence": fusion_result.confidence,
                "modalities": {
                    "vision": round(vision_score, 1),
                    "eye": round(eye_score, 1),
                    "biometric": round(bio_score, 1),
                    "audio": round(audio_score, 1),
                },
                "details": {
                    "blink_rate": vision_features.blink_rate if vision_features else 0,
                    "perclos": round(vision_features.perclos, 3) if vision_features else 0,
                    "head_pitch": round(vision_features.head_pitch, 1) if vision_features else 0,
                    "head_yaw": round(vision_features.head_yaw, 1) if vision_features else 0,
                    "expression": vision_features.dominant_expression if vision_features else "neutral",
                    "gaze_stability": round(eye_features.fixation_stability, 2) if eye_features else 0,
                    "saccade_count": eye_features.saccade_count if eye_features else 0,
                    "microsleep": eye_features.microsleep_detected if eye_features else False,
                    "typing_wpm": round(bio_features.keystroke.typing_speed_wpm, 1) if bio_features.has_keystroke_data else 0,
                    "error_rate": round(bio_features.keystroke.error_rate, 3) if bio_features.has_keystroke_data else 0,
                    "mouse_jitter": round(bio_features.mouse.jitter, 2) if bio_features.has_mouse_data else 0,
                    "audio_arousal": round(audio_features.arousal, 2) if audio_features else 0,
                    "audio_valence": round(audio_features.valence, 2) if audio_features else 0,
                },
                "session": {
                    "id": active_session_id,
                    "duration_minutes": round(elapsed, 1),
                },
                "intervention": intervention_data,
            }

            await websocket.send_json(response)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "neurolens"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
