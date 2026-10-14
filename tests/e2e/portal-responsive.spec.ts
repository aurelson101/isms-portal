import { expect, test } from "@playwright/test";

const permissions = { showMenu: true, read: true, search: true, preview: true, download: true, upload: true, edit: true, publish: true, archive: true };
const categories = Array.from({ length: 20 }, (_, index) => ({ id: `category-${index}`, slug: `category-${index}`, spaceId: "policies", nameFr: `Rubrique ${index} avec un intitule suffisamment long`, nameEn: `Category ${index} with a long title` }));
const space = { id: "policies", slug: "policies", nameFr: "Documents", nameEn: "Documents", permissions, categories };
const title = `Procedure ${"documentaire".repeat(15)}`;
const policy = {
  id: "policy", slug: "policy", status: "PUBLISHED", sensitive: false,
  publishedAt: "2026-10-04T09:00:00Z", favorite: false, viewCount: 0, downloadCount: 0,
  space, category: categories[19], permissions, reviews: [],
  translations: [{ locale: "fr", title, description: "Description" }, { locale: "en", title: "English policy", description: "Description" }],
  versions: ["fr", "en"].map((locale) => ({ id: `version-${locale}`, locale, version: 1, createdAt: "2026-10-04T09:00:00Z", storedFile: { mimeType: "application/pdf", originalName: "policy.pdf", size: 1024 } })),
};

for (const width of [320, 390, 768, 1280]) {
  test(`portal menus and documents fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 600 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { displayName: "Test moderator", username: "moderator@example.test", isAdmin: false, isModerator: true, locale: "fr", spaces: [space], authentication: { source: "directory", ssoConnected: true, diagnostics: { groupCount: 1, mappedSpaceCount: 1, administrator: false, administratorAccount: false } } } });
      if (path === "/api/branding") return route.fulfill({ json: { title: "ISMS Portal", logoDataUrl: null } });
      if (path === "/api/documents") return route.fulfill({ json: { items: [policy], total: 1, totalPages: 1, page: 1 } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/explorer");
    const nav = page.locator("#portal-navigation");
    const toggle = page.locator(".navigation-toggle");
    if (width <= 900) {
      await expect(nav).toBeHidden();
      await toggle.click();
    }
    await nav.locator(".space-menu").click();
    const pagination = nav.locator(".category-pagination");
    await expect(pagination).toBeVisible();
    await expect(pagination.getByRole("button", { name: "2", exact: true })).toBeEnabled();
    if (width <= 900) {
      expect(await nav.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await expect(toggle).toBeInViewport({ ratio: 1 });
      await pagination.getByRole("button", { name: "2", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.click();
    }
    await pagination.getByRole("button", { name: "2", exact: true }).click();
    expect(await pagination.getByRole("button", { name: "2", exact: true }).evaluate((button) => button.clientWidth)).toBeLessThanOrEqual(48);
    await nav.locator(".category-menu").filter({ hasText: "Rubrique 19" }).click();
    await expect(page).toHaveURL(/category=category-19/);
    if (width <= 900) await expect(nav).toBeHidden();
    const row = page.locator(".document-list .document");
    if (width <= 600) expect(await page.locator(".explorer-heading").evaluate((element) => element.clientHeight)).toBeLessThan(400);
    await expect(row.locator(".document-title")).toHaveText(title);
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width <= 900) {
      await expect(row.locator(".locales")).toBeVisible();
      await row.locator(".locales").getByRole("button", { name: "EN", exact: true }).click();
      await expect(row.locator(".document-title")).toHaveText("English policy");
      await expect(row.locator(".download")).toHaveAttribute("href", /locale=en/);
      await row.locator(".locales").getByRole("button", { name: "FR", exact: true }).click();
    }
    await row.locator(".document-manage-actions button").first().click();
    const modal = page.locator(".modal-backdrop");
    await expect(modal).toBeVisible();
    expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await modal.getByRole("button", { name: "Annuler", exact: true }).click();
    await page.screenshot({ path: info.outputPath("documents-list.png"), fullPage: true });
    if (width <= 600) await page.getByRole("button", { name: "Filtrer et trier", exact: true }).click();
    await page.locator("button").filter({ hasText: /^Fenetres$|^Fenêtres$/ }).click();
    const tile = page.locator(".document-grid .document");
    await expect(tile).toBeVisible();
    expect(await tile.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width <= 900) {
      await expect(tile.locator(".locales")).toBeVisible();
      await tile.locator(".locales").getByRole("button", { name: "EN", exact: true }).click();
      await expect(tile.locator(".document-title")).toHaveText("English policy");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("documents-grid.png"), fullPage: true });
  });
}

for (const width of [320, 768, 1280]) {
  test(`admin configuration stays left aligned at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test administrator", locale: "fr", authentication: { source: "directory", ssoConnected: true, diagnostics: { groupCount: 1, mappedSpaceCount: 1 } } } });
      if (path === "/api/admin/dashboard") return route.fulfill({ json: { groups: 0, rules: 0, spaces: 0, documents: 0, syncErrors: 0, attention: { total: 0 } } });
      if (path === "/api/branding") return route.fulfill({ json: { title: "ISMS Portal", logoDataUrl: null } });
      if (path === "/api/auth/config") return route.fulfill({ json: { directoryLoginEnabled: true, ssoLoginUrl: "/oauth2/start", ssoPilotUrl: null } });
      if (path === "/api/auth/sso/test") return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/admin#sso");
    await expect(page.locator(".sso-diagnostic").first()).toBeVisible();
    expect(await page.locator(".sso-diagnostic dd").evaluateAll((elements) => elements.every((element) => getComputedStyle(element).textAlign === "left"))).toBe(true);
    await page.getByRole("button", { name: "Tester le proxy SSO", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Proxy SSO: Joignable");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("sso.png"), fullPage: true });
    await page.goto("/admin#settings");
    const form = page.locator(".profile-settings > .admin-form").first();
    await expect(form).toBeVisible();
    expect(await form.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
    const button = page.locator(".profile-settings > .admin-form button.primary").first();
    await expect(button).toBeVisible();
    expect(await button.evaluate((element) => element.clientWidth <= element.parentElement!.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("settings.png"), fullPage: true });
  });
}
