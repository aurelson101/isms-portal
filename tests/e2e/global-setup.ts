import { request, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!username || !password) return;
  const baseURL =
    config.projects[0]?.use?.baseURL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    "http://127.0.0.1:8080";
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/auth/login", {
    data: { username, password },
  });
  if (!response.ok())
    throw new Error(
      `Playwright administrator login failed: ${response.status()}`,
    );
  await context.storageState({ path: "/tmp/isms-playwright-auth.json" });
  await context.dispose();
}
