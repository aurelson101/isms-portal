import { expect, test } from "./test";

test("admin state changes send JSON and refresh the selected state", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const document = {
    id: "document", status: "DRAFT", sensitive: false,
    translations: [{ locale: "en", title: "State test" }],
    space: { id: "space", nameEn: "Documents", nameFr: "Documents" },
    versions: [{ locale: "en", version: 1, createdAt: "2026-01-01T00:00:00Z" }],
  };
  const states: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", locale: "en", authentication: { source: "local", diagnostics: {} } } });
    if (pathname === "/api/admin/documents") return route.fulfill({ json: { items: [document], total: 1 } });
    if (pathname === "/api/admin/documents/document/status") {
      expect(request.method()).toBe("PUT");
      expect(request.headers()["content-type"]).toMatch(/^application\/json\b/);
      document.status = request.postDataJSON().status;
      states.push(document.status);
      return route.fulfill({ json: document });
    }
    if (pathname === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
    if (pathname === "/api/admin/dashboard") return route.fulfill({ json: null });
    if (pathname === "/api/health/details") return route.fulfill({ json: { services: {} } });
    if (pathname === "/api/branding") return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin#documents");
  const state = page.getByRole("combobox", { name: "Status : State test", exact: true });
  for (const value of ["PUBLISHED", "ARCHIVED", "DRAFT"]) {
    await state.selectOption(value);
    await page.locator(".confirmation-actions button").last().click();
    await expect(state).toHaveValue(value);
    await expect(state).toBeEnabled();
  }
  expect(states).toEqual(["PUBLISHED", "ARCHIVED", "DRAFT"]);
});

for (const width of [320, 1280]) {
  for (const description of ["", null]) {
    test(`admin metadata preserves ${description === null ? "absent" : "empty"} translated descriptions and prevents duplicate saves at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
      const payloads: Record<string, unknown>[] = [];
      let releaseSave!: () => void;
      const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
      const document = {
        id: "document", status: "PUBLISHED", sensitive: false,
        translations: [{ locale: "fr", title: "Politique", description: "Description FR" }, { locale: "en", title: "Policy", description }],
        space: { id: "space", nameEn: "Documents", nameFr: "Documents" },
        versions: [{ id: "version-en", locale: "en", version: 2, createdAt: "2026-01-01T00:00:00Z" }, { id: "version-fr", locale: "fr", version: 1 }],
      };
      await page.route("**/api/**", async route => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test admin", locale: "en", authentication: { source: "local", diagnostics: {} } } });
        if (url.pathname === "/api/admin/documents") return route.fulfill({ json: { items: [document], total: 1 } });
        if (url.pathname === "/api/documents/document/metadata") {
          payloads.push(route.request().postDataJSON());
          await saveGate;
          return route.fulfill({ json: {} });
        }
        if (url.pathname === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
        if (url.pathname === "/api/health/details") return route.fulfill({ json: { services: {} } });
        if (url.pathname === "/api/branding") return route.fulfill({ json: {} });
        return route.fulfill({ json: [] });
      });
      await page.goto("/admin#documents");
      await page.locator(".document-actions button").first().click();
      const form = page.locator("#document-metadata-form");
      const language = form.getByRole("combobox", { name: "Document language", exact: true });
      const details = form.getByRole("textbox", { name: "Description", exact: true });
      await expect(language).toHaveValue("en");
      await expect(details).toHaveValue("");
      await language.selectOption("fr");
      await expect(details).toHaveValue("Description FR");
      await language.selectOption("en");
      await expect(details).toHaveValue("");
      await form.evaluate(element => {
        element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      await expect(form.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      await expect.poll(() => payloads.length).toBe(1);
      releaseSave();
      await expect(form).toHaveCount(0);
      expect(payloads).toEqual([{ locale: "en", versionId: "version-en", title: "Policy", description: "", categoryId: null }]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }
}

for (const width of [320, 390, 768, 1280]) {
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
    if (width === 320) {
      for (const language of ["FR", "EN", "ES", "SK"]) {
        await page.getByRole("button", { name: language, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("lang", language.toLowerCase());
        const clipped = await page.locator("main button").evaluateAll(buttons => buttons.filter(button => button.clientWidth > 0 && button.scrollWidth > button.clientWidth + 2).map(button => button.textContent));
        expect(clipped).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.getByRole("button", { name: "EN", exact: true }).click();
    }
    await pagination.getByRole("button", { name: /Next/ }).click();
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 21");
    // An unchanged search must not reset the page after its debounce delay.
    await page.waitForTimeout(350);
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 21");
    await expect(table.locator("tbody tr")).toHaveCount(20);
    await expect(page).toHaveURL(/docPage=2/);
    await page.reload();
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 21");
    total = 20;
    await pagination.getByRole("button", { name: /Next/ }).click();
    await expect(table.locator("tbody tr").first().locator("td").first()).toContainText("Document 1");
    await expect(pagination).toHaveCount(0);
    expect(requests[0]).toBe(1);
    expect(requests.slice(-3)).toEqual([2, 3, 1]);
  });
}
