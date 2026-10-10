import { expect, test } from "@playwright/test";

test("expired admin sessions reconnect through SSO or dedicated login and retain the section", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
  await page.clock.install();
  let expired = false;
  let authentication: { ssoConnected: boolean; loginUrl: string | null } | undefined;
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/admin/check") return route.fulfill(expired ? { status: 401, json: {} } : { json: { isAdmin: true, username: "admin@example.test", displayName: "Administrator", locale: "fr", authentication } });
    if (pathname === "/api/auth/config") return route.fulfill({ json: { ssoEnabled: true, ssoLoginUrl: "/oauth2/start", directoryLoginEnabled: true } });
    if (pathname === "/api/admin/dashboard") return route.fulfill({ json: { groups: 0, rules: 0, spaces: 0, documents: 0, attention: { total: 0 } } });
    return route.fulfill({ json: [] });
  });
  await page.route("**/oauth2/start**", (route) => route.fulfill({ contentType: "text/plain", body: "SSO sign-in endpoint" }));

  for (const mode of ["sso", "sso-without-login-url", "directory", "missing-authentication"]) {
    expired = false;
    const isSso = mode.startsWith("sso");
    authentication = mode === "missing-authentication" ? undefined : { ssoConnected: isSso, loginUrl: mode === "sso" ? "/oauth2/start?rd=/" : null };
    await page.goto("/admin?source=reconnect#help");
    await expect(page.getByRole("heading", { name: "Aide ISMS Portal", exact: true })).toBeVisible();
    expired = true;
    await page.clock.runFor(60_001);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("heading", { name: "Session expirée" })).toBeVisible();
    await dialog.getByRole("button", { name: "Se reconnecter" }).click();
    await expect(page).toHaveURL(isSso ? /\/oauth2\/start\?/ : /\/admin\/login\?/);
    const destination = new URL(page.url());
    expect(destination.searchParams.get(isSso ? "rd" : "return")).toBe("/admin?source=reconnect#help");
  }
  expect(errors).toEqual([]);
});
