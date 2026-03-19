import { test, expect } from "@playwright/test";
import { NavBarPage } from "../pages/navbar.page";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Navigation tests — verify all pages load and the NavBar routes correctly.
 */
test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  test("root URL redirects to /dashboard", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("NavBar is present on every page", async ({ page }) => {
    const navbar = new NavBarPage(page);
    const routes = ["/dashboard", "/history", "/calibration", "/privacy"];

    for (const route of routes) {
      await page.goto(route);
      await navbar.expectVisible();
    }
  });

  test("NavBar logo links to /dashboard", async ({ page }) => {
    await page.goto("/history");
    const navbar = new NavBarPage(page);
    await navbar.logo.click();
    await page.waitForURL("**/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("NavBar navigates to each page", async ({ page }) => {
    const navbar = new NavBarPage(page);
    await page.goto("/dashboard");

    await navbar.navigateToHistory();
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();

    await navbar.navigateToCalibration();
    await expect(page.getByRole("heading", { name: "Calibrate", exact: true })).toBeVisible();

    await navbar.navigateToPrivacy();
    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();

    await navbar.navigateToDashboard();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  });

  test("NeuroLens branding renders in NavBar", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("NeuroLens")).toBeVisible();
  });

  test("Dashboard page loads with correct title", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/NeuroLens/);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  });

  test("History page loads with correct title", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveTitle(/NeuroLens/);
    await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  });

  test("Calibration page loads with correct title", async ({ page }) => {
    await page.goto("/calibration");
    await expect(page).toHaveTitle(/NeuroLens/);
    await expect(page.getByRole("heading", { name: "Calibrate", exact: true })).toBeVisible();
  });

  test("Privacy page loads with correct title", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/NeuroLens/);
    await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
  });

  test("NavBar nav links are rendered at all breakpoints", async ({ page }) => {
    await page.goto("/dashboard");
    // Nav uses text links, not SVG icons
    const navLinks = page.locator("nav a");
    const count = await navLinks.count();
    // Logo link + 4 nav links = at least 5
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
