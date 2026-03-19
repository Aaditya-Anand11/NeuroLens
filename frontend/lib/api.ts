/**
 * API client for NeuroLens backend.
 * Handles REST endpoints and WebSocket connection management.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export interface FatigueUpdate {
  type: "fatigue_update";
  cli_score: number;
  fatigue_stage: "alert" | "borderline" | "fatigued" | "critical";
  confidence: number;
  modalities: {
    vision: number;
    eye: number;
    biometric: number;
    audio: number;
  };
  details: {
    blink_rate: number;
    perclos: number;
    head_pitch: number;
    head_yaw: number;
    expression: string;
    gaze_stability: number;
    saccade_count: number;
    microsleep: boolean;
    typing_wpm: number;
    error_rate: number;
    mouse_jitter: number;
    audio_arousal: number;
    audio_valence: number;
  };
  session: {
    id: number | null;
    duration_minutes: number;
  };
  intervention: {
    message: string;
    type: string;
    modality: string;
    severity: string;
    generated_by: string;
  } | null;
}

export interface CalibrationUpdate {
  type: "calibration";
  progress: number;
  status: {
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
  };
}

export interface SessionInfo {
  id: number;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  average_cli: number | null;
  peak_cli: number | null;
  total_interventions: number;
}

export interface FatigueRecord {
  timestamp: string;
  cli_score: number;
  fatigue_stage: string;
  vision_score: number;
  eye_score: number;
  biometric_score: number;
  audio_score: number;
}

export interface InterventionRecord {
  id: number;
  session_id: number;
  triggered_at: string;
  trigger_cli: number;
  trigger_stage: string;
  trigger_modality: string;
  message: string;
  intervention_type: string;
  was_dismissed: boolean;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  startSession: (userId = 1) =>
    apiFetch<{ session_id: number; started_at: string; status: string }>(
      "/api/session/start",
      { method: "POST", body: JSON.stringify({ user_id: userId }) }
    ),

  stopSession: (sessionId?: number) =>
    apiFetch<{
      session_id: number;
      ended_at: string;
      average_cli: number;
      peak_cli: number;
      total_interventions: number;
    }>("/api/session/stop", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId }),
    }),

  getSessions: (userId = 1, activeOnly = false, limit = 20) =>
    apiFetch<SessionInfo[]>(
      `/api/session?user_id=${userId}&active_only=${activeOnly}&limit=${limit}`
    ),

  getFatigueHistory: (sessionId: number) =>
    apiFetch<FatigueRecord[]>(`/api/fatigue/history?session_id=${sessionId}`),

  getInterventions: (sessionId?: number, limit = 50) =>
    apiFetch<InterventionRecord[]>(
      `/api/interventions?${sessionId ? `session_id=${sessionId}&` : ""}limit=${limit}`
    ),

  startCalibration: (userId = 1) =>
    apiFetch<{ status: string; duration: number }>("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ action: "start", user_id: userId }),
    }),

  getCalibrationStatus: (userId = 1) =>
    apiFetch<CalibrationUpdate["status"]>("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ action: "status", user_id: userId }),
    }),

  completeCalibration: (userId = 1) =>
    apiFetch<{ status: string; baselines: Record<string, number>; is_valid: boolean }>(
      "/api/calibrate",
      { method: "POST", body: JSON.stringify({ action: "complete", user_id: userId }) }
    ),

  sendBiometricEvent: (event: {
    event_type: string;
    key?: string;
    x?: number;
    y?: number;
    button?: string;
    timestamp?: number;
  }) =>
    apiFetch<{ status: string }>("/api/biometric/event", {
      method: "POST",
      body: JSON.stringify(event),
    }),

  wipeData: (userId = 1) =>
    apiFetch<{ status: string; user_id: number }>("/api/privacy/wipe", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, confirm: true }),
    }),

  healthCheck: () => apiFetch<{ status: string; service: string }>("/api/health"),
};

export type WebSocketMessage = FatigueUpdate | CalibrationUpdate | { type: "error"; message: string };

export function createFatigueWebSocket(
  onMessage: (data: WebSocketMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/fatigue`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data) as WebSocketMessage;
    onMessage(data);
  };

  ws.onerror = (event) => {
    onError?.(event);
  };

  ws.onclose = () => {
    onClose?.();
  };

  return ws;
}

export function frameToBase64(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return dataUrl.split(",")[1];
}
