"""SQLAlchemy ORM models for NeuroLens session data, fatigue timeline, and interventions."""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, Float, String, Text, DateTime, Boolean, ForeignKey, JSON, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

Base = declarative_base()

DATABASE_URL = "sqlite:///neurolens.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    calibration = relationship("CalibrationProfile", back_populates="user", uselist=False)
    sessions = relationship("Session", back_populates="user", order_by="desc(Session.started_at)")


class CalibrationProfile(Base):
    __tablename__ = "calibration_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    baseline_blink_rate = Column(Float, nullable=False, default=15.0)
    baseline_perclos = Column(Float, nullable=False, default=0.05)
    baseline_typing_speed = Column(Float, nullable=False, default=60.0)
    baseline_typing_entropy = Column(Float, nullable=False, default=1.5)
    baseline_mouse_jitter = Column(Float, nullable=False, default=2.0)
    baseline_gaze_stability = Column(Float, nullable=False, default=0.9)
    baseline_f0_mean = Column(Float, nullable=False, default=120.0)
    baseline_speech_rate = Column(Float, nullable=False, default=3.5)
    calibrated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    raw_data = Column(JSON, default=dict)

    user = relationship("User", back_populates="calibration")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    average_cli = Column(Float, nullable=True)
    peak_cli = Column(Float, nullable=True)
    total_interventions = Column(Integer, default=0)

    user = relationship("User", back_populates="sessions")
    fatigue_records = relationship("FatigueRecord", back_populates="session", order_by="FatigueRecord.timestamp")
    interventions = relationship("Intervention", back_populates="session", order_by="Intervention.triggered_at")


class FatigueRecord(Base):
    __tablename__ = "fatigue_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    cli_score = Column(Float, nullable=False)
    fatigue_stage = Column(String(20), nullable=False)
    vision_score = Column(Float, nullable=False)
    eye_score = Column(Float, nullable=False)
    biometric_score = Column(Float, nullable=False)
    audio_score = Column(Float, nullable=False)
    raw_features = Column(JSON, default=dict)

    session = relationship("Session", back_populates="fatigue_records")


class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    triggered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    trigger_cli = Column(Float, nullable=False)
    trigger_stage = Column(String(20), nullable=False)
    trigger_modality = Column(String(50), nullable=False)
    message = Column(Text, nullable=False)
    intervention_type = Column(String(30), nullable=False)
    was_dismissed = Column(Boolean, default=False)
    dismissed_at = Column(DateTime, nullable=True)

    session = relationship("Session", back_populates="interventions")


def init_db():
    Base.metadata.create_all(bind=engine)
