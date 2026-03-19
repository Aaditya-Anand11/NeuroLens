import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the NeuroLens Dashboard page (/dashboard).
 */
export class DashboardPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subheading: Locator;
  readonly startSessionButton: Locator;
  readonly stopSessionButton: Locator;
  readonly connectionStatusLabel: Locator;
  readonly cameraSection: Locator;
  readonly modalityScoresSection: Locator;
  readonly interventionsSection: Locator;
  readonly sessionTimelineSection: Locator;
  readonly fatigueGauge: Locator;
  readonly allClearMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Dashboard", exact: true });
    this.subheading = page.getByText("Real-time cognitive fatigue monitoring");
    this.startSessionButton = page.getByRole("button", { name: /start session/i });
    this.stopSessionButton = page.getByRole("button", { name: /end session/i });
    this.connectionStatusLabel = page.locator(
      ".flex.items-center.gap-2.px-3.py-1\\.5 span"
    );
    this.cameraSection = page.locator(".section-title", { hasText: "Camera" });
    this.modalityScoresSection = page.locator(".section-title", { hasText: "Modality Scores" });
    this.interventionsSection = page.locator(".section-title", { hasText: "Interventions" });
    this.sessionTimelineSection = page.locator(".section-title", { hasText: "Session Timeline" });
    this.fatigueGauge = page.locator(".relative.z-10.flex.justify-center");
    this.allClearMessage = page.getByText("All clear");
  }

  async goto() {
    await this.page.goto("/dashboard");
    await expect(this.heading).toBeVisible();
  }

  async expectInitialState() {
    await expect(this.heading).toBeVisible();
    await expect(this.subheading).toBeVisible();
    await expect(this.startSessionButton).toBeVisible();
    await expect(this.stopSessionButton).not.toBeVisible();
    await expect(this.connectionStatusLabel).toContainText("disconnected");
    await expect(this.allClearMessage).toBeVisible();
  }

  async expectSectionHeadingsVisible() {
    await expect(this.cameraSection).toBeVisible();
    await expect(this.modalityScoresSection).toBeVisible();
    await expect(this.interventionsSection).toBeVisible();
    await expect(this.sessionTimelineSection).toBeVisible();
  }

  async clickStartSession() {
    await this.startSessionButton.click();
  }

  async clickStopSession() {
    await this.stopSessionButton.click();
  }

  async expectSessionActive() {
    await expect(this.stopSessionButton).toBeVisible();
    await expect(this.startSessionButton).not.toBeVisible();
  }

  async expectSessionInactive() {
    await expect(this.startSessionButton).toBeVisible();
    await expect(this.stopSessionButton).not.toBeVisible();
  }

  async expectModalityLabels() {
    const labels = ["Vision", "Eye Tracking", "Biometrics", "Audio"];
    for (const label of labels) {
      await expect(this.page.getByText(label).first()).toBeVisible();
    }
  }
}
