/**
 * API client for NeuroLens backend.
 * Handles REST endpoints, JWT authentication, and WebSocket connection management.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

const TOKEN_KEY = "neurolens_token";
const USER_KEY = "neurolens_user";

// --- Auth token management ---

export interface AuthUser {
  user_id: number;
  username: string;
  access_token: string;
}

export function getStoredAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(TOKEN_KEY);
  const user = sessionStorage.getItem(USER_KEY);
  if (!token || !user) return null;
  try {
    return { ...JSON.parse(user), access_token: token };
  } catch {
    return null;
  }
}

function storeAuth(auth: AuthUser): void {
  sessionStorage.setItem(TOKEN_KEY, auth.access_token);
  sessionStorage.setItem(
    USER_KEY,
    JSON.stringify({ user_id: auth.user_id, username: auth.username })
  );
}

export function clearAuth(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

function getToken(): string {
  const auth = getStoredAuth();
  if (!auth) throw new Error("Not authenticated");
  return auth.access_token;
}

// --- Interfaces ---

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

// --- Fetch helpers ---

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add auth header for non-auth endpoints
  if (!path.startsWith("/api/auth/") && path !== "/api/health") {
    headers["Authorization"] = `Bearer ${getToken()}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (res.status === 401) {
    clearAuth();
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}

// --- API methods ---

export const api = {
  // Auth (public)
  register: async (username: string, password: string) => {
    const result = await apiFetch<{
      access_token: string;
      token_type: string;
      user_id: number;
      username: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    storeAuth(result);
    return result;
  },

  login: async (username: string, password: string) => {
    const result = await apiFetch<{
      access_token: string;
      token_type: string;
      user_id: number;
      username: string;
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    storeAuth(result);
    return result;
  },

  logout: () => {
    clearAuth();
  },

  // Authenticated endpoints
  startSession: () =>
    apiFetch<{ session_id: number; started_at: string; status: string }>(
      "/api/session/start",
      { method: "POST", body: JSON.stringify({}) }
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

  getSessions: (activeOnly = false, limit = 20) =>
    apiFetch<SessionInfo[]>(
      `/api/session?active_only=${activeOnly}&limit=${limit}`
    ),

  getFatigueHistory: (sessionId: number) =>
    apiFetch<FatigueRecord[]>(`/api/fatigue/history?session_id=${sessionId}`),

  getInterventions: (sessionId?: number, limit = 50) =>
    apiFetch<InterventionRecord[]>(
      `/api/interventions?${sessionId ? `session_id=${sessionId}&` : ""}limit=${limit}`
    ),

  startCalibration: () =>
    apiFetch<{ status: string; duration: number }>("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    }),

  getCalibrationStatus: () =>
    apiFetch<CalibrationUpdate["status"]>("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ action: "status" }),
    }),

  completeCalibration: () =>
    apiFetch<{
      status: string;
      baselines: Record<string, number>;
      is_valid: boolean;
    }>("/api/calibrate", {
      method: "POST",
      body: JSON.stringify({ action: "complete" }),
    }),

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

  wipeData: () =>
    apiFetch<{ status: string; user_id: number }>("/api/privacy/wipe", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }),

  healthCheck: () =>
    apiFetch<{ status: string; service: string }>("/api/health"),
};

// --- WebSocket ---

export type WebSocketMessage =
  | FatigueUpdate
  | CalibrationUpdate
  | { type: "error"; message: string };

export function createFatigueWebSocket(
  onMessage: (data: WebSocketMessage) => void,
  onError?: (error: Event) => void,
  onClose?: () => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws/fatigue`);

  ws.onopen = () => {
    // Send JWT token as first message for WebSocket auth
    const auth = getStoredAuth();
    if (auth) {
      ws.send(JSON.stringify({ token: auth.access_token }));
    } else {
      ws.close(4001, "Not authenticated");
    }
  };

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
