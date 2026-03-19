import { test, expect } from "@playwright/test";
import { HistoryPage } from "../pages/history.page";
import {
  mockAllApis,
  mockEmptySessionsList,
  mockSessionsList,
  mockFatigueHistory,
  mockInterventions,
  mockEmptyInterventions,
  MOCK_SESSIONS_LIST,
  MOCK_INTERVENTIONS,
} from "../fixtures/api-mocks";

/**
 * History page tests — session list, session selection, detail pane.
 */
test.describe("History", () => {
  // -------------------------------------------------------------------------
  // Page load with sessions
  // -------------------------------------------------------------------------

  test("renders page heading and subtitle", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await expect(history.heading).toBeVisible();
    await expect(history.subheading).toBeVisible();
  });

  test("shows loading spinner before data arrives", async ({ page }) => {
    await page.route("http://localhost:8000/api/session**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ json: MOCK_SESSIONS_LIST });
    });
    await mockFatigueHistory(page);
    await mockInterventions(page);

    await page.goto("/history");
    await expect(page.locator(".animate-spin")).toBeVisible();
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  });

  test("renders session list with correct session count", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.expectSessionsLoaded();

    await expect(history.sessionItems).toHaveCount(MOCK_SESSIONS_LIST.length);
  });

  test("sessions display IDs and dates", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.waitForLoad();

    for (const session of MOCK_SESSIONS_LIST) {
      await expect(page.getByText(`#${session.id}`)).toBeVisible();
    }
  });

  test("active session shows Active badge", async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    await expect(page.getByText("Active").first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Session selection and detail pane
  // -------------------------------------------------------------------------

  test("first session is auto-selected on load", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.waitForLoad();

    await history.expectDetailPaneVisible();
  });

  test("clicking a session updates the detail pane", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.waitForLoad();

    await history.selectSessionByIndex(1);
    await history.expectDetailPaneVisible();
  });

  test("detail pane shows Average CLI, Peak CLI, Duration, Interventions", async ({
    page,
  }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.waitForLoad();

    await expect(page.getByText("Average CLI").first()).toBeVisible();
    await expect(page.getByText("Peak CLI").first()).toBeVisible();
    await expect(page.getByText("Duration").first()).toBeVisible();
    const interventionTexts = page.getByText("Interventions");
    await expect(interventionTexts.first()).toBeVisible();
  });

  test("fatigue timeline section renders", async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    await expect(page.getByText("Fatigue Timeline")).toBeVisible();
  });

  test("intervention log renders with entries", async ({ page }) => {
    await mockAllApis(page);
    const history = new HistoryPage(page);
    await history.goto();
    await history.waitForLoad();

    await expect(page.getByText("Intervention Log")).toBeVisible();
    await expect(
      page.getByText(MOCK_INTERVENTIONS[0].message)
    ).toBeVisible();
  });

  test("intervention log shows empty state when no interventions", async ({
    page,
  }) => {
    await mockSessionsList(page);
    await mockFatigueHistory(page);
    await mockEmptyInterventions(page);

    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    await expect(
      page.getByText("No interventions during this session")
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  test("shows empty state when no sessions exist", async ({ page }) => {
    await mockEmptySessionsList(page);
    await mockFatigueHistory(page, []);
    await mockInterventions(page, []);

    const history = new HistoryPage(page);
    await history.goto();
    await history.expectEmptyState();
  });

  test("shows prompt to select a session when no session selected in empty list", async ({
    page,
  }) => {
    await mockEmptySessionsList(page);
    await mockFatigueHistory(page, []);
    await mockInterventions(page, []);

    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });

    await expect(
      page.getByText("Select a session to view details")
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  test("shows error state when API fails", async ({ page }) => {
    await page.route("http://localhost:8000/api/session**", (route) =>
      route.fulfill({
        status: 503,
        json: { detail: "Database unavailable" },
      })
    );

    await page.goto("/history");
    await expect(page.getByText("Database unavailable")).toBeVisible({ timeout: 8000 });
  });

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------

  test("screenshot: history page with sessions", async ({ page }) => {
    await mockAllApis(page);
    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/history-with-sessions.png",
      fullPage: true,
    });
  });

  test("screenshot: history page empty state", async ({ page }) => {
    await mockEmptySessionsList(page);
    await mockFatigueHistory(page, []);
    await mockInterventions(page, []);

    await page.goto("/history");
    await page.locator(".animate-spin").waitFor({ state: "hidden", timeout: 8000 });
    await page.screenshot({
      path: "e2e-artifacts/screenshots/history-empty.png",
      fullPage: true,
    });
  });
});
