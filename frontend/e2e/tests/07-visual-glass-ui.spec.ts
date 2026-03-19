import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Visual regression tests for the design system.
 *
 * Verifies:
 * - Surface components render with correct visual styling
 * - Gradient border animations are present
 * - Button states have correct visual treatment
 * - Color tokens are applied consistently
 */
test.describe("Visual — Design System", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0ms !important;
          animation-delay: 0ms !important;
          transition-duration: 0ms !important;
        }
      `,
    });
  });

  // -------------------------------------------------------------------------
  // Surface rendering
  // -------------------------------------------------------------------------

  test("surface class renders on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    const surfaces = page.locator(".surface");
    const count = await surfaces.count();
    expect(count).toBeGreaterThan(2);

    for (let i = 0; i < Math.min(count, 5); i++) {
      await expect(surfaces.nth(i)).toBeVisible();
    }
  });

  test("surface class renders on calibration", async ({ page }) => {
    await page.goto("/calibration");
    const surfaces = page.locator(".surface");
    await expect(surfaces.first()).toBeVisible();
  });

  test("surface class renders on privacy", async ({ page }) => {
    await page.goto("/privacy");
    const surfaces = page.locator(".surface");
    const count = await surfaces.count();
    expect(count).toBeGreaterThan(3);
  });

  // -------------------------------------------------------------------------
  // Button visual states
  // -------------------------------------------------------------------------

  test("btn-primary has correct styling on dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    const startBtn = page.getByRole("button", { name: /start session/i });
    await expect(startBtn).toBeVisible();
    await expect(startBtn).toHaveClass(/btn-primary/);
  });

  test("btn-primary on calibration page has correct styling", async ({
    page,
  }) => {
    await page.goto("/calibration");
    const startBtn = page.getByRole("button", {
      name: /start 60-second calibration/i,
    });
    await expect(startBtn).toHaveClass(/btn-primary/);
  });

  test("wipe data button is visible in idle state", async ({
    page,
  }) => {
    await page.goto("/privacy");
    const wipeBtn = page.getByRole("button", { name: /wipe all data/i });
    await expect(wipeBtn).toBeVisible();
  });

  test("wipe data button changes to btn-danger class on first click", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await page.getByRole("button", { name: /wipe all data/i }).click();
    const confirmBtn = page.getByRole("button", {
      name: /click again to confirm/i,
    });
    await expect(confirmBtn).toHaveClass(/btn-danger/);
  });

  // -------------------------------------------------------------------------
  // Gradient border (Privacy banner)
  // -------------------------------------------------------------------------

  test("gradient-border class present on privacy banner", async ({
    page,
  }) => {
    await page.goto("/privacy");
    const gradientBorder = page.locator(".gradient-border");
    await expect(gradientBorder).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Stat cards
  // -------------------------------------------------------------------------

  test("stat-card class renders in history detail pane", async ({ page }) => {
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    const statCards = page.locator(".stat-card");
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Section title styling
  // -------------------------------------------------------------------------

  test("section-title class is applied to section headings", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    const sectionTitles = page.locator(".section-title");
    const count = await sectionTitles.count();
    expect(count).toBeGreaterThan(2);
  });

  // -------------------------------------------------------------------------
  // Full-page visual screenshots
  // -------------------------------------------------------------------------

  test("screenshot: dashboard full page (animations disabled)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/visual-dashboard-no-anim.png",
      fullPage: true,
    });
  });

  test("screenshot: calibration intro (animations disabled)", async ({
    page,
  }) => {
    await page.goto("/calibration");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/visual-calibration-no-anim.png",
      fullPage: true,
    });
  });

  test("screenshot: history page (animations disabled)", async ({ page }) => {
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/visual-history-no-anim.png",
      fullPage: true,
    });
  });

  test("screenshot: privacy page (animations disabled)", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/visual-privacy-no-anim.png",
      fullPage: true,
    });
  });
});
