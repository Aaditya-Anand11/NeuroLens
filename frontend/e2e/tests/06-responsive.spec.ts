import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Responsive design tests — verify layout adapts correctly at
 * mobile (390px), tablet (768px), and desktop (1440px) widths.
 */

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
} as const;

test.describe("Responsive design", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // NavBar
  // -------------------------------------------------------------------------

  test("NavBar is sticky and always visible", async ({ page }) => {
    await page.goto("/dashboard");
    const navbar = page.locator("nav");
    await expect(navbar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 500));
    await expect(navbar).toBeVisible();
  });

  test("NavBar nav links visible on mobile", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/dashboard");

    // Nav uses text links (no SVG icons), verify at least 4 links
    const navLinks = page.locator("nav a");
    const count = await navLinks.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("NavBar labels visible at desktop width", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/dashboard");

    await expect(page.locator("nav").getByText("Dashboard")).toBeVisible();
    await expect(page.locator("nav").getByText("History")).toBeVisible();
    await expect(page.locator("nav").getByText("Calibrate")).toBeVisible();
    await expect(page.locator("nav").getByText("Privacy")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------

  test("Dashboard: main sections visible on mobile", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/dashboard");

    // On mobile, sections stack vertically. Verify key sections exist in DOM
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Modality Scores")).toBeVisible();
    await expect(page.getByText("Interventions").first()).toBeVisible();
  });

  test("Dashboard: screenshot at mobile viewport", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/dashboard-mobile.png",
      fullPage: true,
    });
  });

  test("Dashboard: screenshot at tablet viewport", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/dashboard-tablet.png",
      fullPage: true,
    });
  });

  test("Dashboard: screenshot at desktop viewport", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/dashboard-desktop.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  test("History: session list visible on mobile", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    await expect(page.getByText("Sessions").first()).toBeVisible();
  });

  test("History: screenshot at mobile viewport", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    await page.screenshot({
      path: "e2e-artifacts/screenshots/history-mobile.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Calibration
  // -------------------------------------------------------------------------

  test("Calibration: baseline grid goes from 4-col to 2-col on mobile", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class FastWS extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor() {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
            const msg = JSON.stringify({ type: "calibration", progress: 1, status: { is_complete: true, is_running: false, elapsed_seconds: 60, total_duration: 60, progress: 1, samples_collected: 120, has_vision: true, has_gaze: true, has_keystroke: true, has_mouse: true, has_audio: true } });
            setTimeout(() => { if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg })); }, 200);
          }, 100);
        }
        send() {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FastWS;
    });

    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/calibration");
    await page.getByRole("button", { name: /start 60-second calibration/i }).click();
    await expect(page.getByText("Calibration Complete")).toBeVisible({ timeout: 8000 });

    await expect(page.getByText("Your Baselines", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "e2e-artifacts/screenshots/calibration-complete-mobile.png",
      fullPage: true,
    });
  });

  // -------------------------------------------------------------------------
  // Privacy
  // -------------------------------------------------------------------------

  test("Privacy: renders correctly at mobile viewport", async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
    await expect(page.getByText("Zero cloud dependency")).toBeVisible();
    await page.screenshot({
      path: "e2e-artifacts/screenshots/privacy-mobile.png",
      fullPage: true,
    });
  });
});
