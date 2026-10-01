import { expect, test } from "./test";

for (const width of [390, 768, 1280]) {
  test(`admin documents use server pagination at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const requests: number[] = [];
    let total = 41;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = [];
      if (url.pathname === "/api/admin/check") {
        json = { isAdmin: true, username: "admin@example.test", displayName: "Test admin", primaryAdmin: true, locale: "en", authentication: { source: "local", ssoConnected: false, diagnostics: {} } };
      } else if (url.pathname === "/api/branding") json = {};
      else if (url.pathname === "/api/admin/dashboard") json = null;
      else if (url.pathname === "/api/admin/audit") json = { items: [] };
      else if (url.pathname === "/api/health/details") json = { services: {} };
      else if (url.pathname === "/api/admin/documents") {
        expect(url.searchParams.get("limit")).toBe("20");
        const current = Number(url.searchParams.get("page"));
        expect(current).toBeGreaterThan(0);
        requests.push(current);
        const start = (current - 1) * 20;
        json = {
          page: current, limit: 20, total,
          items: Array.from({ length: Math.min(20, Math.max(0, total - start)) }, (_, index) => ({
            id: `document-${start + index + 1}`, status: "PUBLISHED", sensitive: false,
            translations: [{ locale: "en", title: `Document ${start + index + 1}` }],
            space: { id: "space", nameEn: "Test space", nameFr: "Test space" },
            versions: [{ locale: "en", version: 1, createdAt: "2026-01-01T00:00:00Z" }],
          })),
        };
      }
      await route.fulfill({ json });
    });
    await page.goto("/admin#documents");
    const table = page.locator(".admin-actions-table");
    const pagination = page.getByRole("navigation", { name: "Document pagination" });
    await expect(table.locator("tbody tr")).toHaveCount(20);
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 1");
    await pagination.getByRole("button", { name: /Next/ }).click();
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 21");
    await expect(table.locator("tbody tr")).toHaveCount(20);
    total = 20;
    await pagination.getByRole("button", { name: /Next/ }).click();
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 1");
    await expect(pagination).toHaveCount(0);
    expect(requests[0]).toBe(1);
    expect(requests.slice(-3)).toEqual([2, 3, 1]);
  });
}
