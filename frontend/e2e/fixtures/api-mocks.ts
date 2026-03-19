import { Page, Route } from "@playwright/test";

/**
 * API mock helpers for NeuroLens E2E tests.
 *
 * All API calls go to http://localhost:8000 (or NEXT_PUBLIC_API_URL).
 * These mocks intercept fetch requests made by the Next.js frontend
 * so tests run without a live backend.
 */

const API = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Canonical mock data
// ---------------------------------------------------------------------------

export const MOCK_SESSION = {
  session_id: 42,
  started_at: new Date().toISOString(),
  status: "started",
};

export const MOCK_STOP_SESSION = {
  session_id: 42,
  ended_at: new Date().toISOString(),
  average_cli: 35.2,
  peak_cli: 61.4,
  total_interventions: 2,
};

export const MOCK_SESSIONS_LIST = [
  {
    id: 1,
    started_at: "2026-03-17T09:00:00Z",
    ended_at: "2026-03-17T09:45:00Z",
    is_active: false,
    average_cli: 28.5,
    peak_cli: 55.0,
    total_interventions: 1,
  },
  {
    id: 2,
    started_at: "2026-03-17T14:00:00Z",
    ended_at: "2026-03-17T15:30:00Z",
    is_active: false,
    average_cli: 62.3,
    peak_cli: 81.7,
    total_interventions: 4,
  },
  {
    id: 3,
    started_at: "2026-03-18T08:00:00Z",
    ended_at: null,
    is_active: true,
    average_cli: 40.0,
    peak_cli: 50.0,
    total_interventions: 0,
  },
];

export const MOCK_FATIGUE_HISTORY = [
  {
    timestamp: "2026-03-17T09:05:00Z",
    cli_score: 15,
    fatigue_stage: "alert",
    vision_score: 12,
    eye_score: 10,
    biometric_score: 18,
    audio_score: 14,
  },
  {
    timestamp: "2026-03-17T09:20:00Z",
    cli_score: 32,
    fatigue_stage: "borderline",
    vision_score: 30,
    eye_score: 28,
    biometric_score: 35,
    audio_score: 27,
  },
  {
    timestamp: "2026-03-17T09:35:00Z",
    cli_score: 55,
    fatigue_stage: "fatigued",
    vision_score: 52,
    eye_score: 60,
    biometric_score: 50,
    audio_score: 48,
  },
];

export const MOCK_INTERVENTIONS = [
  {
    id: 1,
    session_id: 1,
    triggered_at: "2026-03-17T09:30:00Z",
    trigger_cli: 52.0,
    trigger_stage: "fatigued",
    trigger_modality: "eye",
    message: "Your blink rate has decreased significantly. Consider taking a short break.",
    intervention_type: "break",
    was_dismissed: false,
  },
];

export const MOCK_EMPTY_SESSIONS: never[] = [];
export const MOCK_EMPTY_INTERVENTIONS: never[] = [];

export const MOCK_CALIBRATION_START = {
  status: "started",
  duration: 60,
};

export const MOCK_CALIBRATION_COMPLETE = {
  status: "calibrated",
  is_valid: true,
  baselines: {
    blink_rate: 16.5,
    perclos: 0.042,
    typing_speed: 72,
    typing_entropy: 0.88,
    mouse_jitter: 3.2,
    gaze_stability: 0.91,
    f0_mean: 165,
    speech_rate: 4.3,
  },
};

export const MOCK_WIPE_SUCCESS = {
  status: "wiped",
  user_id: 1,
};

export const MOCK_HEALTH = {
  status: "ok",
  service: "neurolens",
};

// ---------------------------------------------------------------------------
// Route interceptors
// ---------------------------------------------------------------------------

export async function mockHealthCheck(page: Page) {
  await page.route(`${API}/api/health`, async (route: Route) => {
    await route.fulfill({ json: MOCK_HEALTH });
  });
}

export async function mockStartSession(page: Page, overrides = {}) {
  await page.route(`${API}/api/session/start`, async (route: Route) => {
    await route.fulfill({ json: { ...MOCK_SESSION, ...overrides } });
  });
}

export async function mockStopSession(page: Page, overrides = {}) {
  await page.route(`${API}/api/session/stop`, async (route: Route) => {
    await route.fulfill({ json: { ...MOCK_STOP_SESSION, ...overrides } });
  });
}

export async function mockSessionsList(
  page: Page,
  sessions = MOCK_SESSIONS_LIST
) {
  await page.route(`${API}/api/session**`, async (route: Route) => {
    await route.fulfill({ json: sessions });
  });
}

export async function mockEmptySessionsList(page: Page) {
  await mockSessionsList(page, MOCK_EMPTY_SESSIONS);
}

export async function mockFatigueHistory(
  page: Page,
  data = MOCK_FATIGUE_HISTORY
) {
  await page.route(`${API}/api/fatigue/history**`, async (route: Route) => {
    await route.fulfill({ json: data });
  });
}

export async function mockInterventions(
  page: Page,
  data = MOCK_INTERVENTIONS
) {
  await page.route(`${API}/api/interventions**`, async (route: Route) => {
    await route.fulfill({ json: data });
  });
}

export async function mockEmptyInterventions(page: Page) {
  await mockInterventions(page, MOCK_EMPTY_INTERVENTIONS);
}

export async function mockCalibrationStart(page: Page) {
  await page.route(`${API}/api/calibrate`, async (route: Route) => {
    const body = JSON.parse((route.request().postData() as string) || "{}");
    if (body.action === "start") {
      await route.fulfill({ json: MOCK_CALIBRATION_START });
    } else if (body.action === "complete") {
      await route.fulfill({ json: MOCK_CALIBRATION_COMPLETE });
    } else {
      await route.fulfill({ json: { status: "idle" } });
    }
  });
}

export async function mockWipeData(
  page: Page,
  options: { shouldFail?: boolean } = {}
) {
  await page.route(`${API}/api/privacy/wipe`, async (route: Route) => {
    if (options.shouldFail) {
      await route.fulfill({
        status: 500,
        json: { detail: "Internal server error" },
      });
    } else {
      await route.fulfill({ json: MOCK_WIPE_SUCCESS });
    }
  });
}

/**
 * Mock all API endpoints with sensible defaults.
 * Use this as a base for most tests that just need a working app state.
 */
export async function mockAllApis(
  page: Page,
  options: {
    sessions?: typeof MOCK_SESSIONS_LIST | never[];
    interventions?: typeof MOCK_INTERVENTIONS | never[];
    fatigueHistory?: typeof MOCK_FATIGUE_HISTORY | never[];
  } = {}
) {
  await mockHealthCheck(page);
  await mockStartSession(page);
  await mockStopSession(page);
  await mockSessionsList(page, options.sessions ?? MOCK_SESSIONS_LIST);
  await mockFatigueHistory(page, options.fatigueHistory ?? MOCK_FATIGUE_HISTORY);
  await mockInterventions(page, options.interventions ?? MOCK_INTERVENTIONS);
  await mockCalibrationStart(page);
  await mockWipeData(page);
}
