import { test, expect } from "@playwright/test";
import { PrivacyPage } from "../pages/privacy.page";
import { mockAllApis } from "../fixtures/api-mocks";

/**
 * Privacy page tests — content sections and wipe data confirmation flow.
 */
test.describe("Privacy", () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page);
  });

  // -------------------------------------------------------------------------
  // Page content
  // -------------------------------------------------------------------------

  test("renders page heading and subtitle", async ({ page }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await expect(privacy.heading).toBeVisible();
    await expect(privacy.subheading).toBeVisible();
  });

  test("shows privacy banner with zero cloud dependency", async ({ page }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await expect(privacy.privacyBanner).toBeVisible();
    await expect(privacy.privacyBannerHeading).toBeVisible();
  });

  test("renders all privacy sections", async ({ page }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.expectAllSectionsVisible();
  });

  test("What Is Collected section has bullet points", async ({ page }) => {
    await page.goto("/privacy");
    const section = page.getByRole("heading", { name: "What Is Collected" });
    await expect(section).toBeVisible();
    await expect(
      page.getByText("Webcam frames processed in real-time")
    ).toBeVisible();
  });

  test("How Data Is Stored section mentions SQLite", async ({ page }) => {
    await page.goto("/privacy");
    await expect(
      page.getByText("All data stored locally in SQLite")
    ).toBeVisible();
  });

  test("What Is Never Collected section mentions keystroke content", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(
      page.getByText("Keystroke content (only timing patterns)")
    ).toBeVisible();
  });

  test("Third-Party Services section mentions Gemini", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByText(/Gemini 1\.5 Flash/)).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Wipe data flow
  // -------------------------------------------------------------------------

  test("Wipe All Data button is visible in idle state", async ({
    page,
  }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await expect(privacy.wipeDataButton).toBeVisible();
    await expect(privacy.wipeDataButton).toBeEnabled();
  });

  test("first click transitions to confirming state", async ({ page }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.clickWipeData();
    await privacy.expectConfirmingState();
  });

  test("confirm button text says Click Again to Confirm", async ({
    page,
  }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.clickWipeData();
    await expect(privacy.confirmWipeButton).toContainText(
      "Click Again to Confirm"
    );
  });

  test("second click calls wipe API and shows success message", async ({
    page,
  }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();

    await privacy.clickWipeData();
    await privacy.expectConfirmingState();

    await privacy.clickConfirmWipe();
    await privacy.expectSuccessState();
  });

  test("success message shows correct text", async ({ page }) => {
    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.clickWipeData();
    await privacy.clickConfirmWipe();

    const successMsg = page.getByText("All data wiped.");
    await expect(successMsg).toBeVisible();
  });

  test("wipe API failure shows error message", async ({ page }) => {
    await page.route("http://localhost:8000/api/privacy/wipe", (route) =>
      route.fulfill({
        status: 500,
        json: { detail: "Failed to wipe data" },
      })
    );

    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.clickWipeData();
    await privacy.clickConfirmWipe();

    await expect(page.getByText("Failed to wipe data")).toBeVisible({
      timeout: 5000,
    });
  });

  test("wipe button shows Wiping... in loading state", async ({ page }) => {
    await page.route("http://localhost:8000/api/privacy/wipe", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ json: { status: "wiped", user_id: 1 } });
    });

    const privacy = new PrivacyPage(page);
    await privacy.goto();
    await privacy.clickWipeData();
    await privacy.clickConfirmWipe();

    await expect(page.getByRole("button", { name: /wiping/i })).toBeVisible({
      timeout: 3000,
    });
  });

  // -------------------------------------------------------------------------
  // Screenshots
  // -------------------------------------------------------------------------

  test("screenshot: privacy page initial state", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "e2e-artifacts/screenshots/privacy-initial.png",
      fullPage: true,
    });
  });

  test("screenshot: privacy page confirming wipe state", async ({ page }) => {
    await page.goto("/privacy");
    const wipeBtn = page.getByRole("button", { name: /wipe all data/i });
    await wipeBtn.scrollIntoViewIfNeeded();
    await wipeBtn.click();
    await page.screenshot({
      path: "e2e-artifacts/screenshots/privacy-confirming-wipe.png",
      fullPage: true,
    });
  });
});
