import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the NeuroLens navigation bar.
 */
export class NavBarPage {
  readonly page: Page;

  readonly logo: Locator;
  readonly logoText: Locator;
  readonly dashboardLink: Locator;
  readonly historyLink: Locator;
  readonly calibrationLink: Locator;
  readonly privacyLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.logo = page.locator('nav a[href="/dashboard"]').first();
    this.logoText = page.locator("nav").getByText("NeuroLens");
    this.dashboardLink = page.locator('nav a[href="/dashboard"]').last();
    this.historyLink = page.locator('nav a[href="/history"]');
    this.calibrationLink = page.locator('nav a[href="/calibration"]');
    this.privacyLink = page.locator('nav a[href="/privacy"]');
  }

  async expectVisible() {
    // Logo text may be hidden on very small viewports, just check nav exists
    const nav = this.page.locator("nav");
    await expect(nav).toBeVisible();
    await expect(this.dashboardLink).toBeVisible();
    await expect(this.historyLink).toBeVisible();
    await expect(this.calibrationLink).toBeVisible();
    await expect(this.privacyLink).toBeVisible();
  }

  async navigateToDashboard() {
    await this.dashboardLink.click();
    await this.page.waitForURL("**/dashboard");
  }

  async navigateToHistory() {
    await this.historyLink.click();
    await this.page.waitForURL("**/history");
  }

  async navigateToCalibration() {
    await this.calibrationLink.click();
    await this.page.waitForURL("**/calibration");
  }

  async navigateToPrivacy() {
    await this.privacyLink.click();
    await this.page.waitForURL("**/privacy");
  }
}
