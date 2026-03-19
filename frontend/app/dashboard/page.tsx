"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import FatigueGauge from "../../components/FatigueGauge";
import LiveFeed from "../../components/LiveFeed";
import InterventionCard from "../../components/InterventionCard";
import SessionTimeline from "../../components/SessionTimeline";
import NeuralMesh from "../../components/NeuralMesh";
import WaveformRing from "../../components/WaveformRing";
import {
  api,
  createFatigueWebSocket,
  type FatigueUpdate,
  type WebSocketMessage,
} from "../../lib/api";

interface TimelinePoint {
  timestamp: string;
  cli_score: number;
  vision_score: number;
  eye_score: number;
  biometric_score: number;
  audio_score: number;
}

interface ActiveIntervention {
  id: number;
  message: string;
  type: string;
  modality: string;
  severity: "info" | "medium" | "high" | "critical";
  generatedBy: string;
}

export default function DashboardPage() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [cliScore, setCliScore] = useState(0);
  const [fatigueStage, setFatigueStage] = useState<string>("alert");
  const [confidence, setConfidence] = useState(0);
  const [modalities, setModalities] = useState({ vision: 0, eye: 0, biometric: 0, audio: 0 });
  const [details, setDetails] = useState<FatigueUpdate["details"] | null>(null);
  const [duration, setDuration] = useState(0);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [interventions, setInterventions] = useState<ActiveIntervention[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"disconnected" | "connected" | "error">("disconnected");
  // Focus timer
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [focusRemaining, setFocusRemaining] = useState<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const interventionIdRef = useRef(0);
  const biometricBufferRef = useRef<Array<{ event_type: string; key?: string; x?: number; y?: number; timestamp: number }>>([]);

  // Biometric event capture
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      biometricBufferRef.current.push({ event_type: "key_down", key: e.key, timestamp: Date.now() / 1000 });
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      biometricBufferRef.current.push({ event_type: "key_up", key: e.key, timestamp: Date.now() / 1000 });
    };
    const handleMouseMove = (e: MouseEvent) => {
      biometricBufferRef.current.push({ event_type: "mouse_move", x: e.clientX, y: e.clientY, timestamp: Date.now() / 1000 });
    };
    const handleClick = (e: MouseEvent) => {
      biometricBufferRef.current.push({ event_type: "mouse_click", x: e.clientX, y: e.clientY, timestamp: Date.now() / 1000 });
    };

    if (isSessionActive) {
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("click", handleClick);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick);
    };
  }, [isSessionActive]);

  const handleMessage = useCallback((data: WebSocketMessage) => {
    if (data.type === "fatigue_update") {
      const update = data as FatigueUpdate;
      setCliScore(update.cli_score);
      setFatigueStage(update.fatigue_stage);
      setConfidence(update.confidence);
      setModalities(update.modalities);
      setDetails(update.details);
      setDuration(update.session.duration_minutes);

      setTimeline((prev) => {
        const point: TimelinePoint = {
          timestamp: new Date().toISOString(),
          cli_score: update.cli_score,
          vision_score: update.modalities.vision,
          eye_score: update.modalities.eye,
          biometric_score: update.modalities.biometric,
          audio_score: update.modalities.audio,
        };
        const next = [...prev, point];
        return next.length > 500 ? next.slice(-500) : next;
      });

      if (update.intervention) {
        const id = ++interventionIdRef.current;
        setInterventions((prev) =>
          [
            {
              id,
              message: update.intervention!.message,
              type: update.intervention!.type,
              modality: update.intervention!.modality,
              severity: update.intervention!.severity as ActiveIntervention["severity"],
              generatedBy: update.intervention!.generated_by,
            },
            ...prev,
          ].slice(0, 10)
        );

        if ("Notification" in window && Notification.permission === "granted" && update.intervention.severity === "critical") {
          new Notification("NeuroLens Alert", {
            body: update.intervention.message,
            icon: "/favicon.ico",
          });
        }
      }
    }
  }, []);

  const startSession = async () => {
    try {
      const result = await api.startSession();
      setSessionId(result.session_id);
      setIsSessionActive(true);
      setTimeline([]);
      setInterventions([]);
      setCliScore(0);
      setFatigueStage("alert");

      const ws = createFatigueWebSocket(
        handleMessage,
        () => setConnectionStatus("error"),
        () => setConnectionStatus("disconnected")
      );
      ws.onopen = () => setConnectionStatus("connected");
      wsRef.current = ws;

      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  };

  const stopSession = async () => {
    try {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      await api.stopSession(sessionId ?? undefined);
      setIsSessionActive(false);
      setConnectionStatus("disconnected");
      stopFocusTimer();
    } catch (err) {
      console.error("Failed to stop session:", err);
    }
  };

  const handleFrame = useCallback((base64Frame: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const events = biometricBufferRef.current.splice(0);
      wsRef.current.send(
        JSON.stringify({
          frame: base64Frame,
          biometric_events: events.length > 0 ? events : undefined,
        })
      );
    }
  }, []);

  const handleAudioChunk = useCallback((base64Audio: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ audio: base64Audio }));
    }
  }, []);

  const dismissIntervention = (id: number) => {
    setInterventions((prev) => prev.filter((i) => i.id !== id));
  };

  // Focus timer
  const startFocusTimer = () => {
    setFocusRemaining(focusMinutes * 60);
    focusTimerRef.current = setInterval(() => {
      setFocusRemaining((prev) => {
        if (prev === null || prev <= 1) {
          stopFocusTimer();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Focus Timer Complete", { body: "Time for a break!" });
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopFocusTimer = () => {
    if (focusTimerRef.current) {
      clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    setFocusRemaining(null);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const MODALITY_CONFIG = [
    { label: "Vision", key: "vision" as const, color: "#9d6eff" },
    { label: "Eye Tracking", key: "eye" as const, color: "#4d8eff" },
    { label: "Biometrics", key: "biometric" as const, color: "#ffb224" },
    { label: "Audio", key: "audio" as const, color: "#ff8c42" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="heading-lg">Dashboard</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            Real-time cognitive fatigue monitoring
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <div className="relative">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: connectionStatus === "connected" ? "var(--accent-green)" : connectionStatus === "error" ? "var(--accent-red)" : "var(--text-muted)",
                }}
              />
              {connectionStatus === "connected" && (
                <div className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping" style={{ background: "var(--accent-green)", opacity: 0.4 }} />
              )}
            </div>
            <span className="text-[11px] font-medium capitalize" style={{ color: "var(--text-muted)" }}>
              {connectionStatus}
            </span>
          </div>

          {/* Session button */}
          {!isSessionActive ? (
            <button type="button" onClick={startSession} className="btn-primary">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
                Start Session
              </span>
            </button>
          ) : (
            <button type="button" onClick={stopSession} className="btn-danger">
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                End Session
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Accent divider */}
      <div className="accent-line" />

      {/* Main Grid - Asymmetric 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column: Camera + Focus Timer + Session */}
        <div className="lg:col-span-3 space-y-5">
          <div className="surface p-4">
            <span className="section-title block mb-3">Camera</span>
            <LiveFeed
              onFrame={handleFrame}
              onAudioChunk={handleAudioChunk}
              isActive={isSessionActive}
              frameRate={5}
            />
          </div>

          {/* Focus Timer */}
          {isSessionActive && (
            <div className="surface p-5 animate-slide-up">
              <span className="section-title block mb-3">Focus Timer</span>
              {focusRemaining === null ? (
                <div className="flex items-center gap-2">
                  <select
                    value={focusMinutes}
                    onChange={(e) => setFocusMinutes(Number(e.target.value))}
                    className="bg-transparent border rounded-lg px-2 py-1.5 text-sm font-mono"
                    style={{ borderColor: "var(--border-medium)", color: "var(--text-primary)" }}
                  >
                    {[15, 20, 25, 30, 45, 60].map((m) => (
                      <option key={m} value={m} style={{ background: "var(--bg-elevated)" }}>
                        {m} min
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={startFocusTimer} className="btn-primary py-1.5 px-3 text-xs">
                    Start
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-3xl font-mono font-bold" style={{ color: "var(--accent-green)" }}>
                    {formatTimer(focusRemaining)}
                  </div>
                  <button
                    type="button"
                    onClick={stopFocusTimer}
                    className="mt-2 text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Session info */}
          {isSessionActive && (
            <div className="surface p-5 animate-slide-up" style={{ animationDelay: "80ms" }}>
              <span className="section-title block mb-3">Session</span>
              <div className="space-y-2.5">
                {[
                  { label: "ID", value: `#${sessionId}` },
                  { label: "Duration", value: `${duration.toFixed(1)} min` },
                  { label: "Alerts", value: `${interventions.length}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{label}</span>
                    <span className="text-[12px] font-mono" style={{ color: "var(--text-secondary)" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center column: Gauge + Modalities + Metrics */}
        <div className="lg:col-span-5 space-y-5">
          {/* Gauge */}
          <div className="surface p-8 relative overflow-hidden">
            <div className="absolute inset-0 opacity-50">
              <NeuralMesh intensity={cliScore} nodeCount={20} opacity={0.3} />
            </div>
            <div className="relative z-10 flex justify-center">
              <FatigueGauge score={cliScore} stage={fatigueStage} confidence={confidence} />
            </div>
          </div>

          {/* Modality bars */}
          <div className="surface p-5">
            <span className="section-title block mb-4">Modality Scores</span>
            <div className="space-y-3.5">
              {MODALITY_CONFIG.map(({ label, key, color }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
                    </div>
                    <span className="text-[11px] font-mono" style={{ color: "var(--text-primary)" }}>
                      {modalities[key].toFixed(1)}
                    </span>
                  </div>
                  <div className="w-full h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(modalities[key], 100)}%`,
                        backgroundColor: color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed metrics grid */}
          {details && (
            <div className="surface p-5 animate-slide-up">
              <span className="section-title block mb-4">Metrics</span>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Blink Rate", value: details.blink_rate.toFixed(0), unit: "/min" },
                  { label: "PERCLOS", value: (details.perclos * 100).toFixed(1), unit: "%" },
                  { label: "Expression", value: details.expression, unit: "" },
                  { label: "Typing", value: details.typing_wpm.toFixed(0), unit: "WPM" },
                  { label: "Gaze", value: (details.gaze_stability * 100).toFixed(0), unit: "%" },
                  {
                    label: "Microsleep",
                    value: details.microsleep ? "YES" : "No",
                    unit: "",
                    danger: details.microsleep,
                  },
                ].map(({ label, value, unit, danger }) => (
                  <div key={label} className="stat-card">
                    <span className="text-[9px] uppercase tracking-[0.1em] block mb-1.5" style={{ color: "var(--text-muted)" }}>
                      {label}
                    </span>
                    <span
                      className={`text-base font-mono font-semibold ${label === "Expression" ? "capitalize" : ""}`}
                      style={{ color: danger ? "var(--accent-red)" : "var(--text-primary)" }}
                    >
                      {value}
                    </span>
                    {unit && (
                      <span className="text-[9px] ml-0.5" style={{ color: "var(--text-muted)" }}>
                        {unit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Interventions */}
        <div className="lg:col-span-4 space-y-5">
          <div className="surface p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="section-title">Interventions</span>
              {interventions.length > 0 && (
                <span
                  className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                  style={{ color: "var(--accent-red)", background: "rgba(255,77,106,0.12)" }}
                >
                  {interventions.length}
                </span>
              )}
            </div>
            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {interventions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="relative w-14 h-14 mb-3">
                    <WaveformRing score={10} size={56} color="#00e5a0" />
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>All clear</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                    No interventions triggered
                  </p>
                </div>
              ) : (
                interventions.map((intervention) => (
                  <InterventionCard
                    key={intervention.id}
                    message={intervention.message}
                    type={intervention.type}
                    modality={intervention.modality}
                    severity={intervention.severity}
                    generatedBy={intervention.generatedBy}
                    onDismiss={() => dismissIntervention(intervention.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="surface p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <NeuralMesh intensity={cliScore} nodeCount={12} opacity={0.15} />
        </div>
        <div className="relative z-10">
          <span className="section-title block mb-4">Session Timeline</span>
          <SessionTimeline data={timeline} showModalities={true} height={220} />
        </div>
      </div>
    </div>
  );
}
