import { defineConfig, devices } from "@playwright/test";

/**
 * NeuroLens E2E Test Configuration
 * Targets the Next.js frontend running on localhost:3000.
 * The backend API is mocked via route interception in most tests.
 */
export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "e2e-report", open: "never" }],
    ["junit", { outputFile: "e2e-results.xml" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Allow camera/mic to be accessed (mocked in tests)
    permissions: ["camera", "microphone"],
    // Ignore SSL errors for localhost
    ignoreHTTPSErrors: true,
    // Generous navigation timeout for Next.js hydration
    navigationTimeout: 15000,
    actionTimeout: 8000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-tablet",
      use: {
        ...devices["iPad Pro"],
        viewport: { width: 1024, height: 768 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  // Expects the Next.js dev server to already be running on port 3000
  // Start with: npm run dev
  outputDir: "e2e-artifacts",
  snapshotDir: "e2e/snapshots",
});
