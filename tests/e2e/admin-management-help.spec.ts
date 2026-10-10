import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`admin management and bilingual help at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [] };
    const groups = Array.from({ length: 21 }, (_, index) => ({ id: `group-${index}`, name: `Group ${index + 1}`, distinguishedName: `CN=Group${index + 1},DC=example,DC=test`, description: "", memberCount: 1, active: index < 20, accessRules: [] }));
    const rules = groups.map((group, index) => ({ id: `rule-${index}`, groupId: group.id, spaceId: space.id, group, space, read: true, preview: true, download: false }));
    const queries: URLSearchParams[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = [];
      if (url.pathname === "/api/admin/check") json = { isAdmin: true, username: "admin@example.test", displayName: "Administrator", locale: "fr" };
      else if (url.pathname === "/api/admin/groups") json = groups;
      else if (url.pathname === "/api/admin/spaces") json = [space];
      else if (url.pathname === "/api/admin/access-rules") json = rules;
      else if (url.pathname === "/api/admin/dashboard") json = { groups: 21, rules: 21, spaces: 1, documents: 0, attention: { total: 0 } };
      else if (url.pathname === "/api/admin/audit") json = { items: [] };
      else if (url.pathname === "/api/health/details") json = { services: { postgres: true, redis: true, clamav: true }, storage: {} };
      else if (url.pathname === "/api/admin/documents") { queries.push(url.searchParams); json = { items: [], total: 0 }; }
      return route.fulfill({ json });
    });
    await page.goto("/admin#groups");
    await expect(page.locator(".admin-actions-table tbody tr")).toHaveCount(20);
    await page.getByRole("navigation", { name: "Pagination des groupes" }).getByRole("button", { name: "Suivant" }).click();
    await expect(page.locator(".admin-actions-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".admin-actions-table tbody")).toContainText("Group 21");
    await page.locator(".admin-management-tools select").selectOption("inactive");
    await expect(page.getByRole("navigation", { name: "Pagination des groupes" })).toHaveCount(0);
    await expect(page.locator(".admin-actions-table tbody")).toContainText("Group 21");
    await page.goto("/admin#rules");
    await expect(page.locator(".matrix tbody tr")).toHaveCount(20);
    await page.locator(".admin-management-tools select").first().selectOption("group-20");
    await expect(page.locator(".matrix tbody tr")).toHaveCount(1);
    const edit = page.getByRole("button", { name: "Éditer Group 21", exact: true });
    await edit.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".drawer")).toBeVisible();
    await page.goto("/admin#documents");
    await page.getByLabel("Rechercher un document", { exact: true }).fill("policy & travel");
    await expect.poll(() => queries.at(-1)?.get("q")).toBe("policy & travel");
    expect(queries.at(-1)?.get("page")).toBe("1");
    await page.locator(".admin-management-tools select").selectOption("status");
    await expect.poll(() => queries.at(-1)?.get("sort")).toBe("status");
    await page.goto("/admin#help");
    await expect(page.getByRole("heading", { name: "Aide ISMS Portal", exact: true })).toBeVisible();
    await expect(page.locator(".admin-help article")).toHaveCount(19);
    await page.getByLabel("Rechercher dans l’aide").fill("no-matching-topic");
    await expect(page.locator(".admin-help article")).toHaveCount(0);
    await page.locator(".admin-help").getByRole("button", { name: "Réinitialiser" }).click();
    await page.locator(".admin-help").getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ISMS Portal help", exact: true })).toBeVisible();
    await expect(page.locator(".admin-help article")).toHaveCount(19);
    await page.getByLabel("Search help").fill("LDAP / LDAPS");
    await expect(page.locator(".admin-help article")).toHaveCount(1);
    await page.locator(".admin-help article").getByRole("button", { name: "Open menu" }).click();
    await expect(page).toHaveURL(/#directory$/);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
