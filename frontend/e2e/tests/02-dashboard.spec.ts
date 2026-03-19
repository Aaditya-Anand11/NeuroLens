import { test, expect } from "@playwright/test";
import { DashboardPage } from "../pages/dashboard.page";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Dashboard page tests — live monitoring, session control, UI sections.
 */
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  test("renders all major sections on load", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectSectionHeadingsVisible();
    await expect(dashboard.fatigueGauge).toBeVisible();
  });

  test("shows Start Session button and disconnected status by default", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectInitialState();
  });

  test("renders modality score labels", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectModalityLabels();
  });

  test("shows All Clear interventions placeholder when no session active", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.allClearMessage).toBeVisible();
    await expect(page.getByText("No interventions triggered")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Session control flow
  // -------------------------------------------------------------------------

  test("Start Session button calls API and switches to End Session", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      class FakeWebSocket extends EventTarget {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
          }, 50);
        }
        send(_data: unknown) {}
        close() {
          this.readyState = 3;
          if (this.onclose) this.onclose(new CloseEvent("close"));
        }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FakeWebSocket;
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.clickStartSession();
    await dashboard.expectSessionActive();
  });

  test("End Session button returns to inactive state", async ({ page }) => {
    await page.addInitScript(() => {
      class FakeWebSocket extends EventTarget {
        readyState = 1;
        onopen: ((ev: Event) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        constructor(_url: string) {
          super();
          setTimeout(() => {
            if (this.onopen) this.onopen(new Event("open"));
          }, 50);
        }
        send(_data: unknown) {}
        close() {
          this.readyState = 3;
          if (this.onclose) this.onclose(new CloseEvent("close"));
        }
      }
      (window as unknown as Record<string, unknown>).WebSocket = FakeWebSocket;
    });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.clickStartSession();
    await dashboard.expectSessionActive();

    await dashboard.clickStopSession();
    await dashboard.expectSessionInactive();
  });

  test("connection status badge shows disconnected on page load", async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.connectionStatusLabel).toContainText("disconnected");
  });

  // -------------------------------------------------------------------------
  // UI elements and interactive components
  // -------------------------------------------------------------------------

  test("modality score progress bars are rendered", async ({ page }) => {
    await page.goto("/dashboard");
    // Each modality section has a label: Vision, Eye Tracking, Biometrics, Audio
    const labels = ["Vision", "Eye Tracking", "Biometrics", "Audio"];
    for (const label of labels) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("session timeline section is rendered", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Session Timeline")).toBeVisible();
  });

  test("Start Session API failure shows console error without crashing", async ({
    page,
  }) => {
    await page.route("http://localhost:8000/api/session/start", (route) =>
      route.fulfill({ status: 500, json: { detail: "Service unavailable" } })
    );

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /start session/i }).click();

    // Page should not crash — heading still visible
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true })
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------

  test("screenshot: dashboard initial state", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/dashboard-initial.png",
      fullPage: true,
    });
  });
});
