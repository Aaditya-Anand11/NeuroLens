"use client";

import { useState, useEffect } from "react";
import SessionTimeline from "../../components/SessionTimeline";
import WaveformRing from "../../components/WaveformRing";
import {
  api,
  type SessionInfo,
  type FatigueRecord,
  type InterventionRecord,
} from "../../lib/api";

function stageColor(cli: number | null): string {
  if (cli === null) return "var(--text-muted)";
  if (cli <= 30) return "var(--accent-green)";
  if (cli <= 55) return "var(--accent-amber)";
  if (cli <= 75) return "#ff8c42";
  return "var(--accent-red)";
}

function stageHex(cli: number | null): string {
  if (cli === null) return "#4e5268";
  if (cli <= 30) return "#00e5a0";
  if (cli <= 55) return "#ffb224";
  if (cli <= 75) return "#ff8c42";
  return "#ff4d6a";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Active";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [fatigueData, setFatigueData] = useState<FatigueRecord[]>([]);
  const [interventionData, setInterventionData] = useState<InterventionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setLoading(true);
      const data = await api.getSessions(1, false, 50);
      setSessions(data);
      if (data.length > 0) {
        await selectSession(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }

  async function selectSession(sessionId: number) {
    setSelectedSession(sessionId);
    try {
      const [fatigue, interventions] = await Promise.all([
        api.getFatigueHistory(sessionId),
        api.getInterventions(sessionId),
      ]);
      setFatigueData(fatigue);
      setInterventionData(interventions);
    } catch (err) {
      console.error("Failed to load session data:", err);
    }
  }

  const selectedSessionInfo = sessions.find((s) => s.id === selectedSession);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 animate-fade-in">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin mb-3"
          style={{ borderColor: "rgba(0,229,160,0.2)", borderTopColor: "var(--accent-green)" }}
        />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading history...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 animate-fade-in">
        <div className="surface p-6 text-center">
          <p className="text-sm" style={{ color: "var(--accent-red)" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="heading-lg">History</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
          Review past sessions, fatigue trends, and interventions
        </p>
      </div>

      <div className="accent-line" />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Session list */}
        <div className="lg:col-span-3">
          <div className="surface p-4">
            <span className="section-title block mb-3">
              Sessions
              <span className="ml-1.5" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                {sessions.length}
              </span>
            </span>
            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-1">
              {sessions.length === 0 ? (
                <p className="text-center py-8 text-xs" style={{ color: "var(--text-muted)" }}>
                  No sessions yet
                </p>
              ) : (
                sessions.map((session) => (
                  <button
                    type="button"
                    key={session.id}
                    onClick={() => selectSession(session.id)}
                    className="w-full text-left p-3 rounded-xl transition-all duration-200 border"
                    style={{
                      background: selectedSession === session.id ? "rgba(255,255,255,0.04)" : "transparent",
                      borderColor: selectedSession === session.id ? "rgba(0,229,160,0.15)" : "transparent",
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                        #{session.id}
                      </span>
                      {session.is_active && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ color: "var(--accent-green)", background: "rgba(0,229,160,0.1)" }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                      {formatDate(session.started_at)}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {formatDuration(session.started_at, session.ended_at)}
                      </span>
                      <span
                        className="text-[12px] font-mono font-semibold"
                        style={{ color: stageColor(session.average_cli) }}
                      >
                        {session.average_cli !== null ? session.average_cli.toFixed(0) : "--"}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Session detail */}
        <div className="lg:col-span-9 space-y-5">
          {selectedSessionInfo ? (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  {
                    label: "Average CLI",
                    value: selectedSessionInfo.average_cli?.toFixed(1) ?? "--",
                    color: stageColor(selectedSessionInfo.average_cli),
                    hex: stageHex(selectedSessionInfo.average_cli),
                  },
                  {
                    label: "Peak CLI",
                    value: selectedSessionInfo.peak_cli?.toFixed(1) ?? "--",
                    color: stageColor(selectedSessionInfo.peak_cli),
                    hex: stageHex(selectedSessionInfo.peak_cli),
                  },
                  {
                    label: "Duration",
                    value: formatDuration(selectedSessionInfo.started_at, selectedSessionInfo.ended_at),
                    color: "var(--text-primary)",
                    hex: "#4d8eff",
                  },
                  {
                    label: "Interventions",
                    value: String(selectedSessionInfo.total_interventions),
                    color: "var(--text-primary)",
                    hex: "#9d6eff",
                  },
                ].map(({ label, value, color, hex }) => (
                  <div key={label} className="stat-card relative overflow-hidden">
                    <div className="absolute -top-3 -right-3 opacity-15">
                      <WaveformRing score={parseInt(value) || 30} size={70} color={hex} />
                    </div>
                    <span className="section-title block mb-2">{label}</span>
                    <span className="metric-value" style={{ color }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div className="surface p-5">
                <span className="section-title block mb-4">Fatigue Timeline</span>
                <SessionTimeline
                  data={fatigueData}
                  interventions={interventionData.map((i) => ({
                    timestamp: i.triggered_at,
                    message: i.message,
                    trigger_cli: i.trigger_cli,
                  }))}
                  showModalities={true}
                  height={320}
                />
              </div>

              {/* Intervention log */}
              <div className="surface p-5">
                <span className="section-title block mb-4">
                  Intervention Log
                  <span className="ml-1.5" style={{ opacity: 0.5 }}>
                    {interventionData.length}
                  </span>
                </span>
                {interventionData.length === 0 ? (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>
                    No interventions during this session
                  </p>
                ) : (
                  <div className="space-y-2">
                    {interventionData.map((intervention) => (
                      <div
                        key={intervention.id}
                        className="p-4 rounded-xl transition-colors"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] uppercase tracking-[0.08em] font-medium" style={{ color: "var(--text-muted)" }}>
                              {intervention.trigger_modality}
                            </span>
                            <span
                              className="text-[10px] font-mono font-semibold"
                              style={{ color: stageColor(intervention.trigger_cli) }}
                            >
                              CLI {intervention.trigger_cli.toFixed(0)}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                            {new Date(intervention.triggered_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {intervention.message}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 surface">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Select a session to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
