import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "readme-screenshots.spec.ts",
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.ISMS_DEMO_URL || "http://127.0.0.1:3107",
    channel: process.env.PLAYWRIGHT_CHANNEL,
    headless: true,
    viewport: { width: 1440, height: 1100 },
  },
});
