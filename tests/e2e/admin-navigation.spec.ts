import { expect, test } from "@playwright/test";

for (const width of [320, 768, 1280]) {
  test(`admin routing and navigation remain usable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let sessionRequests = 0;
    let groupRequests = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/check") {
        sessionRequests++;
        return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test administrator", locale: "fr", authentication: { source: "local", ssoConnected: false, diagnostics: { groupCount: 0, mappedSpaceCount: 0 } } } });
      }
      if (path === "/api/admin/dashboard") {
        return route.fulfill({ json: { groups: 0, rules: 0, spaces: 0, documents: 25, syncErrors: 0, attention: { total: 0 } } });
      }
      if (path === "/api/admin/groups") {
        groupRequests++;
        return route.fulfill({ json: [] });
      }
      if (path === "/api/health/details") return route.fulfill({ json: { services: { postgres: true, redis: true, clamav: true }, storage: { availableBytes: 1024 ** 3, totalBytes: 2 * 1024 ** 3, usedBytes: 1024 ** 3, usedPercent: 50 } } });
      if (path === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
      if (path === "/api/admin/operations/summary") return route.fulfill({ json: { failures: 0, denied: 0, accessRequests: 0, reports: 0, unreadNotifications: 0 } });
      if (path === "/api/admin/operations/work-items") return route.fulfill({ json: { accessRequests: [], reports: [], reviews: [], approvals: [] } });
      if (path === "/api/admin/operations/integrations") return route.fulfill({ json: { settings: [] } });
      if (path === "/api/admin/operations/alert-policy") return route.fulfill({ json: { enabled: false, channel: "none", destinationReference: "", fiveXxPercent: "5", deniedPerMinute: "20" } });
      if (path === "/api/admin/operations/alert-channels") return route.fulfill({ json: { configured: { email: false, teams: false, slack: false, webhook: false } } });
      if (path === "/api/admin/operations/email-deliveries/counts") return route.fulfill({ json: { waiting: 0, active: 0, delayed: 0, completed: 25, failed: 0 } });
      if (path === "/api/admin/operations/email-deliveries") return route.fulfill({ json: Array.from({ length: 25 }, (_, index) => ({ id: `mail-${index}`, action: "document.published", resource: `policy-${index}`, status: "ACCEPTED", attempts: 1, createdAt: "2026-10-04T09:00:00Z", finishedAt: null, accepted: 1, error: null })) });
      return route.fulfill({ json: [] });
    });
    await page.goto("/admin#observability");
    const nav = page.locator("#admin-navigation");
    const toggle = page.locator(".navigation-toggle");
    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveText("Observabilité");
    await expect(nav.getByRole("button", { name: "Supervision", exact: true, includeHidden: true })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.locator("#admin-navigation-system button")).toHaveText(["Santé des services", "Observabilité", "Journal d’audit"]);
    await expect(nav.locator("#admin-navigation-configuration button")).toHaveText(["Configuration", "Modérateurs", "Stockage"]);
    const next = page.getByRole("navigation", { name: "Pagination des e-mails" }).getByRole("button", { name: "Suivant", exact: true });
    await expect(next).toBeEnabled();
    await page.mouse.move(0, 0);
    expect(await next.evaluate((button) => getComputedStyle(button).color)).toBe("rgb(7, 104, 234)");
    expect(await next.evaluate((button) => getComputedStyle(button).borderTopWidth)).toBe("1px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const initialSessionRequests = sessionRequests;
    const initialGroupRequests = groupRequests;
    if (width <= 900) {
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(current).toBeVisible();
    }
    await expect(nav.locator(".admin-navigation-submenu button")).toHaveCount(18);
    const menuSearch = nav.getByRole("searchbox", { name: "Rechercher un menu", exact: true });
    await menuSearch.fill("sante");
    await expect(nav.getByRole("button", { name: "Santé des services", exact: true })).toBeVisible();
    await expect(nav.locator(".admin-navigation-submenu button")).toHaveCount(1);
    await menuSearch.fill("STORAGE");
    await expect(nav.getByRole("button", { name: "Stockage", exact: true })).toBeVisible();
    await menuSearch.fill("no-matching-menu");
    await expect(nav.getByRole("status")).toHaveText("Aucun menu trouvé");
    await menuSearch.fill("");
    await expect(nav.locator(".admin-navigation-submenu button")).toHaveCount(18);
    await nav.getByRole("button", { name: "Contenu et accès", exact: true }).click();
    await nav.getByRole("button", { name: "Groupes Active Directory", exact: true }).click();
    await expect(page).toHaveURL(/\/admin#groups$/);
    await expect(current).toHaveText("Groupes Active Directory");
    const historyLength = await page.evaluate(() => history.length);
    if (width <= 900) await toggle.click();
    await current.click();
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin#observability$/);
    await expect(current).toHaveText("Observabilité");
    await page.goForward();
    await expect(page).toHaveURL(/\/admin#groups$/);
    await page.evaluate(() => { window.location.hash = "health"; });
    await expect(current).toHaveText("Santé des services");
    await expect(nav.locator('button[aria-controls="admin-navigation-system"]')).toHaveAttribute("aria-expanded", "true");
    if (width <= 900) {
      await page.setViewportSize({ width, height: 600 });
      await toggle.click();
      await expect(current).toBeVisible();
      await expect(current).toBeInViewport({ ratio: 1 });
      await expect(toggle).toBeInViewport({ ratio: 1 });
      expect(await nav.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.clientWidth > 0 && button.scrollWidth > button.clientWidth).length)).toBe(0);
      await page.screenshot({ path: info.outputPath("navigation-open.png"), fullPage: false });
      await current.focus();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(nav).toBeVisible();
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(current).toBeVisible();
      await expect(current).toBeInViewport({ ratio: 1 });
      await page.setViewportSize({ width, height: 900 });
      await expect(nav).toBeHidden();
    }
    if (width > 900) {
      await page.evaluate(() => {
        const spacer = document.createElement("div");
        spacer.style.height = "1200px";
        document.querySelector(".admin-shell > main")!.append(spacer);
        window.scrollTo(0, 200);
      });
      const contentScroll = await page.evaluate(() => scrollY);
      expect(contentScroll).toBeGreaterThan(0);
      await nav.getByRole("button", { name: "Supervision", exact: true }).click();
      expect(await page.evaluate(() => scrollY)).toBe(contentScroll);
      await nav.getByRole("button", { name: "Supervision", exact: true }).click();
    }
    expect(sessionRequests).toBe(initialSessionRequests);
    expect(groupRequests).toBe(initialGroupRequests);
    expect(errors).toEqual([]);
    if (width > 900) await expect(current).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("navigation.png"), fullPage: false });
  });
}
