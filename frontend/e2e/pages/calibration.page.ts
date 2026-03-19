import { Page, Locator, expect } from "@playwright/test";

/**
 * Page Object Model for the NeuroLens Calibration page (/calibration).
 */
export class CalibrationPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly subheading: Locator;

  // Intro phase
  readonly howItWorksHeading: Locator;
  readonly startCalibrationButton: Locator;
  readonly instructionSteps: Locator;

  // Running phase
  readonly calibratingLabel: Locator;
  readonly progressPercentage: Locator;
  readonly progressBar: Locator;
  readonly modalityChecksGrid: Locator;

  // Complete phase
  readonly calibrationCompleteHeading: Locator;
  readonly baselinesSection: Locator;
  readonly recalibrateButton: Locator;
  readonly goToDashboardLink: Locator;

  // Error state
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Calibrate", exact: true });
    this.subheading = page.getByText(
      "60 seconds to establish your personal baselines"
    );

    // Intro phase
    this.howItWorksHeading = page.getByRole("heading", {
      name: "How it works",
    });
    this.startCalibrationButton = page.getByRole("button", {
      name: /start 60-second calibration/i,
    });
    this.instructionSteps = page.locator(
      ".flex.items-start.gap-3.animate-slide-up"
    );

    // Running phase
    this.calibratingLabel = page.getByText("Calibrating...");
    this.progressPercentage = page.locator(".text-lg.font-mono.font-bold");
    this.progressBar = page.locator(".progress-bar");
    this.modalityChecksGrid = page.locator(".grid.grid-cols-5");

    // Complete phase
    this.calibrationCompleteHeading = page.getByText("Calibration Complete");
    this.baselinesSection = page.getByText("Your Baselines", { exact: true });
    this.recalibrateButton = page.getByRole("button", { name: /recalibrate/i });
    this.goToDashboardLink = page.getByRole("link", { name: /go to dashboard/i });

    // Error state
    this.errorMessage = page.locator(".surface p[style]").filter({ hasText: /.+/ });
  }

  async goto() {
    await this.page.goto("/calibration");
    await expect(this.heading).toBeVisible();
  }

  async expectIntroPhase() {
    await expect(this.howItWorksHeading).toBeVisible();
    await expect(this.startCalibrationButton).toBeVisible();
    await expect(this.instructionSteps).toHaveCount(6);
  }

  async expectRunningPhase() {
    await expect(this.calibratingLabel).toBeVisible();
    await expect(this.progressBar).toBeVisible();
  }

  async expectCompletePhase() {
    await expect(this.calibrationCompleteHeading).toBeVisible();
    await expect(this.baselinesSection).toBeVisible();
    await expect(this.recalibrateButton).toBeVisible();
    await expect(this.goToDashboardLink).toBeVisible();
  }

  async clickStartCalibration() {
    await this.startCalibrationButton.click();
  }

  async clickRecalibrate() {
    await this.recalibrateButton.click();
  }
}
