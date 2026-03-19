"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import LiveFeed from "../../components/LiveFeed";
import NeuralMesh from "../../components/NeuralMesh";
import WaveformRing from "../../components/WaveformRing";
import {
  api,
  createFatigueWebSocket,
  type CalibrationUpdate,
  type WebSocketMessage,
} from "../../lib/api";

interface CalibrationStatus {
  is_running: boolean;
  is_complete: boolean;
  elapsed_seconds: number;
  total_duration: number;
  progress: number;
  samples_collected: number;
  has_vision: boolean;
  has_gaze: boolean;
  has_keystroke: boolean;
  has_mouse: boolean;
  has_audio: boolean;
}

interface Baselines {
  blink_rate: number;
  perclos: number;
  typing_speed: number;
  typing_entropy: number;
  mouse_jitter: number;
  gaze_stability: number;
  f0_mean: number;
  speech_rate: number;
}

export default function CalibrationPage() {
  const [phase, setPhase] = useState<"intro" | "running" | "complete">("intro");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<CalibrationStatus | null>(null);
  const [baselines, setBaselines] = useState<Baselines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleMessage = useCallback((data: WebSocketMessage) => {
    if (data.type === "calibration") {
      const cal = data as CalibrationUpdate;
      setProgress(cal.progress);
      setStatus(cal.status);
      if (cal.status.is_complete) {
        completeCalibration();
      }
    }
  }, []);

  async function startCalibration() {
    try {
      setError(null);
      await api.startCalibration();
      setPhase("running");
      setProgress(0);
      const ws = createFatigueWebSocket(
        handleMessage,
        () => setError("Connection lost"),
        () => {}
      );
      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    }
  }

  async function completeCalibration() {
    try {
      const result = await api.completeCalibration();
      if (result.status === "calibrated") {
        setBaselines(result.baselines as unknown as Baselines);
        setPhase("complete");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete");
    } finally {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  }

  const handleFrame = useCallback((base64Frame: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ frame: base64Frame }));
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const STEPS = [
    "Sit comfortably at your normal working distance",
    "Ensure good lighting on your face",
    "Look at the screen naturally",
    "Type a few sentences during calibration",
    "Move your mouse around normally",
    "Speak naturally for voice baseline",
  ];

  const CHECKS = [
    { label: "Vision", key: "has_vision" as const, color: "#9d6eff" },
    { label: "Gaze", key: "has_gaze" as const, color: "#4d8eff" },
    { label: "Keys", key: "has_keystroke" as const, color: "#ffb224" },
    { label: "Mouse", key: "has_mouse" as const, color: "#00e5a0" },
    { label: "Audio", key: "has_audio" as const, color: "#ff8c42" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="heading-lg">Calibrate</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
          60 seconds to establish your personal baselines
        </p>
      </div>

      <div className="accent-line" />

      {error && (
        <div className="surface p-4" style={{ borderColor: "rgba(255,77,106,0.2)" }}>
          <p className="text-sm" style={{ color: "var(--accent-red)" }}>{error}</p>
        </div>
      )}

      {/* Intro */}
      {phase === "intro" && (
        <div className="space-y-5">
          <div className="surface p-6 relative overflow-hidden">
            <div className="absolute inset-0">
              <NeuralMesh intensity={8} nodeCount={15} opacity={0.2} />
            </div>
            <div className="relative z-10">
              <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                How it works
              </h2>
              <div className="space-y-3">
                {STEPS.map((step, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <span
                      className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold"
                      style={{ background: "rgba(0,229,160,0.1)", color: "var(--accent-green)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[13px] pt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={startCalibration} className="btn-primary w-full py-3.5 text-sm">
            Start 60-Second Calibration
          </button>
        </div>
      )}

      {/* Running */}
      {phase === "running" && (
        <div className="space-y-5">
          <div className="surface p-4">
            <LiveFeed onFrame={handleFrame} isActive={true} frameRate={5} />
          </div>

          <div className="surface p-6 relative overflow-hidden">
            <div className="absolute top-4 right-4 opacity-60">
              <WaveformRing score={progress * 100} size={70} color="#00e5a0" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Calibrating...
                </span>
                <span className="text-lg font-mono font-bold" style={{ color: "var(--accent-green)" }}>
                  {Math.round(progress * 100)}%
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full overflow-hidden progress-bar" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${progress * 100}%`,
                    background: "linear-gradient(90deg, #00e5a0, #4d8eff)",
                  }}
                />
              </div>

              {status && (
                <div className="grid grid-cols-5 gap-2 mt-5">
                  {CHECKS.map(({ label, key, color }) => {
                    const ok = status[key];
                    return (
                      <div
                        key={label}
                        className="text-center p-2.5 rounded-xl transition-all duration-500 border"
                        style={{
                          background: ok ? "rgba(255,255,255,0.03)" : "transparent",
                          borderColor: ok ? "var(--border-medium)" : "var(--border-subtle)",
                        }}
                      >
                        <div className="text-base mb-0.5 transition-colors duration-500" style={{ color: ok ? color : "var(--text-muted)" }}>
                          {ok ? "\u2713" : "\u2022"}
                        </div>
                        <span className="text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] font-mono mt-4 text-center" style={{ color: "var(--text-muted)" }}>
                {status
                  ? `${status.elapsed_seconds.toFixed(0)}s \u00B7 ${status.samples_collected} samples`
                  : "Waiting..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Complete */}
      {phase === "complete" && baselines && (
        <div className="space-y-5 animate-slide-up">
          <div className="gradient-border">
            <div className="surface p-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-30">
                <NeuralMesh intensity={8} nodeCount={15} opacity={0.2} />
              </div>
              <div className="relative z-10">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(0,229,160,0.1)" }}
                >
                  <svg className="w-7 h-7" style={{ color: "var(--accent-green)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold mb-2" style={{ color: "var(--accent-green)" }}>
                  Calibration Complete
                </h2>
                <p className="text-sm max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
                  Your baselines have been saved. NeuroLens will use these to detect deviations.
                </p>
              </div>
            </div>
          </div>

          <div className="surface p-6">
            <span className="section-title block mb-4">Your Baselines</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Blink Rate", value: baselines.blink_rate.toFixed(1), unit: "/min" },
                { label: "PERCLOS", value: (baselines.perclos * 100).toFixed(1), unit: "%" },
                { label: "Typing", value: baselines.typing_speed.toFixed(0), unit: "WPM" },
                { label: "Entropy", value: baselines.typing_entropy.toFixed(2), unit: "" },
                { label: "Jitter", value: baselines.mouse_jitter.toFixed(1), unit: "px" },
                { label: "Gaze", value: (baselines.gaze_stability * 100).toFixed(0), unit: "%" },
                { label: "F0 Mean", value: baselines.f0_mean.toFixed(0), unit: "Hz" },
                { label: "Speech", value: baselines.speech_rate.toFixed(1), unit: "syl/s" },
              ].map(({ label, value, unit }) => (
                <div key={label} className="stat-card">
                  <span className="text-[9px] uppercase tracking-[0.1em] block mb-1.5" style={{ color: "var(--text-muted)" }}>
                    {label}
                  </span>
                  <span className="text-lg font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {value}
                  </span>
                  {unit && <span className="text-[9px] ml-0.5" style={{ color: "var(--text-muted)" }}>{unit}</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setPhase("intro")} className="flex-1 btn-secondary py-3">
              Recalibrate
            </button>
            <a href="/dashboard" className="flex-1 btn-primary py-3 text-center inline-flex items-center justify-center">
              Go to Dashboard
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
