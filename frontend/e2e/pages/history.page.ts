import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the NeuroLens History page (/history).
 */
export class HistoryPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subheading: Locator;
  readonly sessionsLabel: Locator;
  readonly sessionItems: Locator;
  readonly emptySessionsMessage: Locator;
  readonly loadingSpinner: Locator;

  // Detail pane
  readonly averageCLICard: Locator;
  readonly peakCLICard: Locator;
  readonly durationCard: Locator;
  readonly interventionsCard: Locator;
  readonly fatigueTimelineLabel: Locator;
  readonly interventionLogLabel: Locator;
  readonly selectSessionPrompt: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "History", exact: true });
    this.subheading = page.getByText(
      "Review past sessions, fatigue trends, and interventions"
    );
    this.sessionsLabel = page.getByText("Sessions").first();
    this.sessionItems = page.locator(
      ".space-y-1\\.5 button[type='button']"
    );
    this.emptySessionsMessage = page.getByText("No sessions yet");
    this.loadingSpinner = page.locator(".animate-spin");

    // Detail pane stat cards
    this.averageCLICard = page.getByText("Average CLI").first();
    this.peakCLICard = page.getByText("Peak CLI").first();
    this.durationCard = page.getByText("Duration").first();
    this.interventionsCard = page.getByText("Interventions").first();
    this.fatigueTimelineLabel = page.getByText("Fatigue Timeline");
    this.interventionLogLabel = page.getByText("Intervention Log").first();
    this.selectSessionPrompt = page.getByText("Select a session to view details");
  }

  async goto() {
    await this.page.goto("/history");
    await expect(this.heading).toBeVisible();
  }

  async waitForLoad() {
    await this.loadingSpinner.waitFor({ state: "hidden", timeout: 10000 });
  }

  async expectEmptyState() {
    await this.waitForLoad();
    await expect(this.emptySessionsMessage).toBeVisible();
  }

  async expectSessionsLoaded() {
    await this.waitForLoad();
    await expect(this.sessionsLabel).toBeVisible();
  }

  async selectFirstSession() {
    await this.sessionItems.first().click();
  }

  async selectSessionByIndex(index: number) {
    await this.sessionItems.nth(index).click();
  }

  async expectDetailPaneVisible() {
    await expect(this.averageCLICard).toBeVisible();
    await expect(this.peakCLICard).toBeVisible();
    await expect(this.durationCard).toBeVisible();
    await expect(this.fatigueTimelineLabel).toBeVisible();
    await expect(this.interventionLogLabel).toBeVisible();
  }
}
