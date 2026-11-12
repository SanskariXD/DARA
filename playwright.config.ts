import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";
export default defineConfig({
  testDir: "./tests",
  testMatch: "e2e.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(process.env.BASE_URL
    ? {}
    : {
        webServer: {
          command: "npm run start",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 60000,
        },
      }),
});
