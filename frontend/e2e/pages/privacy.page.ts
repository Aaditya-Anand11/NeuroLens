import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the NeuroLens Privacy page (/privacy).
 */
export class PrivacyPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subheading: Locator;
  readonly privacyBanner: Locator;
  readonly privacyBannerHeading: Locator;

  // Section headings
  readonly dataCollectedSection: Locator;
  readonly dataStoredSection: Locator;
  readonly dataNotCollectedSection: Locator;
  readonly thirdPartySection: Locator;

  // Wipe data controls
  readonly wipeDataHeading: Locator;
  readonly wipeDataButton: Locator;
  readonly confirmWipeButton: Locator;
  readonly wipingButton: Locator;
  readonly wipeSuccessMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Privacy", exact: true });
    this.subheading = page.getByText(
      "Privacy-first architecture"
    );
    this.privacyBanner = page.locator(".gradient-border");
    this.privacyBannerHeading = page.getByText("Zero cloud dependency");

    this.dataCollectedSection = page.getByRole("heading", {
      name: "What Is Collected",
    });
    this.dataStoredSection = page.getByRole("heading", {
      name: "How Data Is Stored",
    });
    this.dataNotCollectedSection = page.getByRole("heading", {
      name: "What Is Never Collected",
    });
    this.thirdPartySection = page.getByRole("heading", {
      name: "Third-Party Services",
    });

    this.wipeDataHeading = page.getByRole("heading", { name: "Wipe All Data" });
    this.wipeDataButton = page.getByRole("button", {
      name: /wipe all data/i,
    });
    this.confirmWipeButton = page.getByRole("button", {
      name: /click again to confirm/i,
    });
    this.wipingButton = page.getByRole("button", { name: /wiping\.\.\./i });
    this.wipeSuccessMessage = page.getByText("All data wiped.");
  }

  async goto() {
    await this.page.goto("/privacy");
    await expect(this.heading).toBeVisible();
  }

  async expectAllSectionsVisible() {
    await expect(this.privacyBanner).toBeVisible();
    await expect(this.dataCollectedSection).toBeVisible();
    await expect(this.dataStoredSection).toBeVisible();
    await expect(this.dataNotCollectedSection).toBeVisible();
    await expect(this.thirdPartySection).toBeVisible();
    await expect(this.wipeDataHeading).toBeVisible();
  }

  async clickWipeData() {
    await this.wipeDataButton.scrollIntoViewIfNeeded();
    await this.wipeDataButton.click();
  }

  async clickConfirmWipe() {
    await this.confirmWipeButton.scrollIntoViewIfNeeded();
    await this.confirmWipeButton.click();
  }

  async expectConfirmingState() {
    await expect(this.confirmWipeButton).toBeVisible();
    await expect(this.wipeDataButton).not.toBeVisible();
  }

  async expectSuccessState() {
    await expect(this.wipeSuccessMessage).toBeVisible();
    await expect(this.confirmWipeButton).not.toBeVisible();
  }
}
