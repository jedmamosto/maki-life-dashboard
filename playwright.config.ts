import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      TZ: "UTC",
      ENABLE_TEST_HARNESS: "true",
      CARE_REPO_DRIVER: "file",
      CARE_DATA_FILE: ".data/e2e-care.json",
      HOUSEHOLD_TOKEN: "maki-e2e-household-token-2026",
      OWNER_DEFAULT_PIN: "1234",
      SESSION_SECRET: "maki-e2e-session-secret-2026",
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
