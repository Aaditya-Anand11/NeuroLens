import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Animation tests — verify CSS animations are defined and applied.
 */
test.describe("Animations", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // Page fade-in animations
  // -------------------------------------------------------------------------

  test("Dashboard main content has animate-fade-in class", async ({ page }) => {
    await page.goto("/dashboard");
    const mainContent = page.locator(".animate-fade-in").first();
    await expect(mainContent).toBeVisible();
  });

  test("Calibration page has animate-fade-in class", async ({ page }) => {
    await page.goto("/calibration");
    const mainContent = page.locator(".animate-fade-in").first();
    await expect(mainContent).toBeVisible();
  });

  test("History page has animate-fade-in class", async ({ page }) => {
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    const mainContent = page.locator(".animate-fade-in").first();
    await expect(mainContent).toBeVisible();
  });

  test("Privacy page has animate-fade-in class", async ({ page }) => {
    await page.goto("/privacy");
    const mainContent = page.locator(".animate-fade-in").first();
    await expect(mainContent).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // fade-in keyframe is defined in CSS
  // -------------------------------------------------------------------------

  test("fade-in animation keyframe is registered in CSS", async ({ page }) => {
    await page.goto("/dashboard");
    const hasFadeIn = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSKeyframesRule &&
              rule.name === "fade-in"
            ) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheet — skip
        }
      }
      return false;
    });
    expect(hasFadeIn).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Progress bar shimmer animation
  // -------------------------------------------------------------------------

  test("progress-bar shimmer class is applied on calibration running phase", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class SlowWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor() {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            const msg = JSON.stringify({
              type: "calibration",
              progress: 0.5,
              status: { is_complete: false, is_running: true, elapsed_seconds: 30, total_duration: 60, progress: 0.5, samples_collected: 60, has_vision: true, has_gaze: true, has_keystroke: false, has_mouse: false, has_audio: false },
            });
            setTimeout(() => { if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg })); }, 200);
          }, 100);
        }
        send() {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = SlowWS;
    });

    await page.goto("/calibration");
    await page.getByRole("button", { name: /start 60-second calibration/i }).click();
    await expect(page.locator(".progress-bar")).toBeVisible({ timeout: 5000 });

    const hasShimmer = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSKeyframesRule &&
              rule.name === "progress-shimmer"
            ) {
              return true;
            }
          }
        } catch {
          // skip
        }
      }
      return false;
    });
    expect(hasShimmer).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Connection status ping animation
  // -------------------------------------------------------------------------

  test("connected status shows animate-ping dot (with fake WebSocket)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class ConnectedWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor() {
          super();
          setTimeout(() => { if (this.onopen) this.onopen(new Event("open")); }, 50);
        }
        send() {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = ConnectedWS;
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /start session/i }).click();

    await expect(
      page.locator(".animate-ping")
    ).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Slide-up animation on calibration instructions
  // -------------------------------------------------------------------------

  test("calibration instruction items have animate-slide-up class", async ({
    page,
  }) => {
    await page.goto("/calibration");
    const items = page.locator(".animate-slide-up");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  // -------------------------------------------------------------------------
  // Ambient background animation
  // -------------------------------------------------------------------------

  test("body::before ambient animation is registered", async ({ page }) => {
    await page.goto("/dashboard");
    const hasAmbientDrift = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSKeyframesRule &&
              rule.name === "ambient-float"
            ) {
              return true;
            }
          }
        } catch {
          // skip
        }
      }
      return false;
    });
    expect(hasAmbientDrift).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Session info slide-up after session starts
  // -------------------------------------------------------------------------

  test("session info card appears with animate-slide-up after start", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class FakeWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor() {
          super();
          setTimeout(() => { if (this.onopen) this.onopen(new Event("open")); }, 50);
        }
        send() {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FakeWS;
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /start session/i }).click();

    const sessionInfoCard = page.locator(".animate-slide-up").first();
    await expect(sessionInfoCard).toBeVisible({ timeout: 5000 });
  });
});
