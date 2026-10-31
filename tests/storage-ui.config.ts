import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: /(?:storage-ui|approvals-ui)\.spec\.ts/,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3187",
    screenshot: "only-on-failure",
  },
});
