import { test, expect } from "@playwright/test";
import { CalibrationPage } from "../pages/calibration.page";
import { mockAllApis, MOCK_CALIBRATION_COMPLETE } from "../fixtures/api-mocks";

/**
 * Calibration page tests — intro -> running -> complete phases with API mocks.
 */
test.describe("Calibration", () => {
  function injectFakeWebSocket(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
    return page.addInitScript(() => {
      class FakeCalibrationWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;

        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            let elapsed = 0;
            const tick = setInterval(() => {
              elapsed += 5;
              const progress = Math.min(elapsed / 60, 1);
              const msg = JSON.stringify({
                type: "calibration",
                progress,
                status: {
                  is_running: progress < 1,
                  is_complete: progress >= 1,
                  elapsed_seconds: elapsed,
                  total_duration: 60,
                  progress,
                  samples_collected: elapsed * 2,
                  has_vision: elapsed >= 5,
                  has_gaze: elapsed >= 10,
                  has_keystroke: elapsed >= 15,
                  has_mouse: elapsed >= 20,
                  has_audio: elapsed >= 25,
                },
              });
              if (this.onmessage) {
                this.onmessage(new MessageEvent("message", { data: msg }));
              }
              if (progress >= 1) clearInterval(tick);
            }, 200);
          }, 100);
        }

        send(_data: unknown) {}
        close() {
          this.readyState = 3;
        }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FakeCalibrationWS;
    });
  }

  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // Intro phase
  // -------------------------------------------------------------------------

  test("renders intro phase by default", async ({ page }) => {
    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.expectIntroPhase();
  });

  test("shows all 6 numbered instruction steps", async ({ page }) => {
    await page.goto("/calibration");
    const steps = page.locator(".flex.items-start.gap-3.animate-slide-up");
    await expect(steps).toHaveCount(6);
  });

  test("renders how-it-works description text", async ({ page }) => {
    await page.goto("/calibration");
    await expect(
      page.getByRole("heading", { name: "How it works" })
    ).toBeVisible();
  });

  test("Start 60-Second Calibration button is visible and enabled", async ({
    page,
  }) => {
    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await expect(calibration.startCalibrationButton).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Intro -> Running phase transition
  // -------------------------------------------------------------------------

  test("clicking Start Calibration transitions to running phase", async ({
    page,
  }) => {
    await injectFakeWebSocket(page);
    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();
    await calibration.expectRunningPhase();
  });

  test("running phase shows progress bar and percentage", async ({ page }) => {
    await injectFakeWebSocket(page);
    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();

    await expect(calibration.calibratingLabel).toBeVisible();
    await expect(calibration.progressPercentage).toBeVisible();
    await expect(calibration.progressBar).toBeVisible();
  });

  test("modality check indicators appear during calibration", async ({
    page,
  }) => {
    await injectFakeWebSocket(page);
    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();

    await expect(calibration.modalityChecksGrid).toBeVisible({ timeout: 5000 });

    for (const label of ["Vision", "Gaze", "Keys", "Mouse", "Audio"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  // -------------------------------------------------------------------------
  // Running -> Complete phase transition
  // -------------------------------------------------------------------------

  test("calibration completes and shows baselines", async ({ page }) => {
    await page.addInitScript(() => {
      class FastCalibrationWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            const msg = JSON.stringify({
              type: "calibration",
              progress: 1,
              status: {
                is_running: false,
                is_complete: true,
                elapsed_seconds: 60,
                total_duration: 60,
                progress: 1,
                samples_collected: 120,
                has_vision: true,
                has_gaze: true,
                has_keystroke: true,
                has_mouse: true,
                has_audio: true,
              },
            });
            setTimeout(() => {
              if (this.onmessage) {
                this.onmessage(new MessageEvent("message", { data: msg }));
              }
            }, 300);
          }, 100);
        }
        send(_data: unknown) {}
        close() {
          this.readyState = 3;
        }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FastCalibrationWS;
    });

    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();

    await expect(calibration.calibrationCompleteHeading).toBeVisible({
      timeout: 10000,
    });
    await calibration.expectCompletePhase();

    const baselines = MOCK_CALIBRATION_COMPLETE.baselines;
    await expect(
      page.getByText(baselines.blink_rate.toFixed(1))
    ).toBeVisible();
  });

  test("Recalibrate button returns to intro phase", async ({ page }) => {
    await page.addInitScript(() => {
      class ImmediateCompleteWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            const msg = JSON.stringify({
              type: "calibration",
              progress: 1,
              status: { is_complete: true, is_running: false, elapsed_seconds: 60, total_duration: 60, progress: 1, samples_collected: 120, has_vision: true, has_gaze: true, has_keystroke: true, has_mouse: true, has_audio: true },
            });
            setTimeout(() => {
              if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg }));
            }, 100);
          }, 50);
        }
        send(_data: unknown) {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = ImmediateCompleteWS;
    });

    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();
    await expect(calibration.calibrationCompleteHeading).toBeVisible({ timeout: 8000 });

    await calibration.clickRecalibrate();
    await calibration.expectIntroPhase();
  });

  test("Go to Dashboard link navigates to /dashboard", async ({ page }) => {
    await page.addInitScript(() => {
      class ImmediateCompleteWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            const msg = JSON.stringify({
              type: "calibration",
              progress: 1,
              status: { is_complete: true, is_running: false, elapsed_seconds: 60, total_duration: 60, progress: 1, samples_collected: 120, has_vision: true, has_gaze: true, has_keystroke: true, has_mouse: true, has_audio: true },
            });
            setTimeout(() => {
              if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg }));
            }, 100);
          }, 50);
        }
        send(_data: unknown) {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = ImmediateCompleteWS;
    });

    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();
    await expect(calibration.calibrationCompleteHeading).toBeVisible({ timeout: 8000 });

    await calibration.goToDashboardLink.click();
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  test("shows error when calibration API fails", async ({ page }) => {
    await page.route("http://localhost:8000/api/calibrate", (route) =>
      route.fulfill({
        status: 500,
        json: { detail: "Calibration service unavailable" },
      })
    );

    const calibration = new CalibrationPage(page);
    await calibration.goto();
    await calibration.clickStartCalibration();

    // Error text should appear somewhere on the page
    await expect(page.getByText("Calibration service unavailable")).toBeVisible({ timeout: 5000 });
  });

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------

  test("screenshot: calibration intro phase", async ({ page }) => {
    await page.goto("/calibration");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/calibration-intro.png",
      fullPage: true,
    });
  });
});
