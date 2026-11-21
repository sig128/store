import { defineConfig, devices } from "@playwright/test";

const executablePath = process.env.CHROME_PATH || (process.env.CI ? undefined : "/usr/bin/google-chrome");

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath, args: ["--no-sandbox"] } : undefined,
  },
  projects: [
    {
      name: "phone-reduced-motion",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, reducedMotion: "reduce", browserName: "chromium" },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
