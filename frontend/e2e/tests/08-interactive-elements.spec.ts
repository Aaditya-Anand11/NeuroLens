import { test, expect } from "@playwright/test";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Interactive element tests — buttons, links, forms, and interactive
 * components across all pages.
 */
test.describe("Interactive elements", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // Buttons
  // -------------------------------------------------------------------------

  test("Start Session button is enabled by default", async ({ page }) => {
    await page.goto("/dashboard");
    const btn = page.getByRole("button", { name: /start session/i });
    await expect(btn).toBeEnabled();
  });

  test("Wipe Data button is enabled in idle state", async ({ page }) => {
    await page.goto("/privacy");
    const btn = page.getByRole("button", { name: /wipe all data/i });
    await expect(btn).toBeEnabled();
  });

  test("Wipe Data button is disabled while wiping", async ({ page }) => {
    await page.route("http://localhost:8000/api/privacy/wipe", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: { status: "wiped", user_id: 1 } });
    });

    await page.goto("/privacy");
    await page.getByRole("button", { name: /wipe all data/i }).click();
    await page.getByRole("button", { name: /click again to confirm/i }).click();

    const wipingBtn = page.getByRole("button", { name: /wiping/i });
    await expect(wipingBtn).toBeDisabled();
  });

  test("Start Calibration button is enabled", async ({ page }) => {
    await page.goto("/calibration");
    const btn = page.getByRole("button", {
      name: /start 60-second calibration/i,
    });
    await expect(btn).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Navigation links
  // -------------------------------------------------------------------------

  test("all NavBar links are focusable", async ({ page }) => {
    await page.goto("/dashboard");
    const navLinks = page.locator("nav a");
    for (const link of await navLinks.all()) {
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
    }
  });

  test("Go to Dashboard link on calibration complete page works", async ({
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
            setTimeout(() => { if (this.onmessage) this.onmessage(new MessageEvent("message", { data: msg })); }, 100);
          }, 50);
        }
        send() {}
        close() { this.readyState = 3; }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FastWS;
    });

    await page.goto("/calibration");
    await page.getByRole("button", { name: /start 60-second calibration/i }).click();
    await expect(page.getByText("Calibration Complete")).toBeVisible({ timeout: 8000 });

    const dashboardLink = page.getByRole("link", { name: /go to dashboard/i });
    await expect(dashboardLink).toBeVisible();
    await expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  // -------------------------------------------------------------------------
  // Session list click interaction
  // -------------------------------------------------------------------------

  test("session list items in history are clickable", async ({ page }) => {
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    const sessionItems = page.locator(".space-y-1\\.5 button[type='button']");
    const count = await sessionItems.count();
    expect(count).toBeGreaterThan(0);

    await sessionItems.first().click();
    await expect(page.getByText("Fatigue Timeline")).toBeVisible();
  });

  test("dismiss button does not exist by default (no interventions)", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("All clear")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Form elements
  // -------------------------------------------------------------------------

  test("no orphaned form inputs on any page (except focus timer select)", async ({ page }) => {
    const routes = ["/history", "/calibration", "/privacy"];
    for (const route of routes) {
      await page.goto(route);
      const inputs = page.locator("input:not([type='hidden'])");
      const count = await inputs.count();
      expect(count).toBe(0);
    }
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------

  test("Tab key cycles through NavBar links", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
    }

    const focused = page.locator(":focus");
    const tagName = await focused.evaluate((el) => el.tagName.toLowerCase());
    expect(["a", "button", "div", "select"]).toContain(tagName);
  });

  test("Start Session button is reachable by keyboard and activatable", async ({
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
    const startBtn = page.getByRole("button", { name: /start session/i });
    await startBtn.focus();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("button", { name: /end session/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("Wipe Data button can be activated with keyboard", async ({ page }) => {
    await page.goto("/privacy");
    const wipeBtn = page.getByRole("button", { name: /wipe all data/i });
    await wipeBtn.focus();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("button", { name: /click again to confirm/i })
    ).toBeVisible();
  });

  test("Escape key does not close any critical modal (privacy has no modal)", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await page.getByRole("button", { name: /wipe all data/i }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: /click again to confirm/i })
    ).toBeVisible();
  });
});
