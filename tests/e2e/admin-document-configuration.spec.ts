import { expect, test } from "./test";

const space = { id: "b4de1b9f-1db0-4cd4-9ed9-3309bd3b4001", nameEn: "Test space", nameFr: "Test space", categories: [
  { id: "b4de1b9f-1db0-4cd4-9ed9-3309bd3b4002", nameEn: "Parent", nameFr: "Parent", parentId: null },
  { id: "b4de1b9f-1db0-4cd4-9ed9-3309bd3b4003", nameEn: "Child", nameFr: "Child", parentId: "b4de1b9f-1db0-4cd4-9ed9-3309bd3b4002" },
] };
const group = { id: "b4de1b9f-1db0-4cd4-9ed9-3309bd3b4004", name: "Readers", active: true };

for (const width of [390, 1440]) {
  test(`admin custom metadata is saved and can be removed without changing version at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const document = { id: "document", status: "PUBLISHED", space, metadata: { Reference: "POL-001" } as Record<string, string>, translations: [{ locale: "en", title: "Policy", description: "" }], versions: [{ id: "version", locale: "en", version: 1 }] };
    const saved: Record<string, unknown>[] = [];
    await page.route("**/api/**", async route => {
      const request = route.request(), { pathname } = new URL(request.url());
      if (pathname === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", locale: "en", authentication: {} } });
      if (pathname === "/api/admin/spaces") return route.fulfill({ json: [space] });
      if (pathname === "/api/admin/documents") return route.fulfill({ json: { items: [document], total: 1 } });
      if (pathname === "/api/documents/document/metadata") { const body = request.postDataJSON(); saved.push(body); document.metadata = body.metadata; return route.fulfill({ json: document.translations[0] }); }
      if (pathname === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
      if (pathname === "/api/admin/dashboard") return route.fulfill({ json: null });
      if (pathname === "/api/health/details") return route.fulfill({ json: { services: {} } });
      return route.fulfill({ json: pathname === "/api/branding" ? {} : [] });
    });
    await page.goto("/admin#documents");
    await page.locator(".document-actions button").first().click();
    const form = page.locator("#document-metadata-form");
    await form.getByRole("textbox", { name: "Reference", exact: true }).fill("POL-002");
    await form.getByRole("textbox", { name: "Field name", exact: true }).fill("Reference");
    await expect(form.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
    await form.getByRole("textbox", { name: "Field name", exact: true }).fill("Owner");
    await form.getByRole("button", { name: "Add", exact: true }).click();
    await form.getByRole("textbox", { name: "Owner", exact: true }).fill("Quality");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(saved[0].metadata).toEqual({ Reference: "POL-002", Owner: "Quality" });
    await page.locator(".document-actions button").first().click();
    await expect(form.getByRole("textbox", { name: "Owner", exact: true })).toHaveValue("Quality");
    await form.getByRole("button", { name: "Delete Owner", exact: true }).click();
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(saved[1].metadata).toEqual({ Reference: "POL-002" });
    expect(document.versions).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test("admin access rules select nested categories and clear stale selections when space changes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/**", async route => {
    const request = route.request(), { pathname } = new URL(request.url());
    if (pathname === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", locale: "en", authentication: {} } });
    if (pathname === "/api/admin/spaces") return route.fulfill({ json: [space] });
    if (pathname === "/api/admin/groups") return route.fulfill({ json: [group] });
    if (pathname === "/api/admin/access-rules" && request.method() === "POST") { saved = request.postDataJSON(); return route.fulfill({ json: { ...saved, id: "rule", group, space, category: space.categories[1] } }); }
    if (pathname === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
    if (pathname === "/api/admin/dashboard") return route.fulfill({ json: null });
    if (pathname === "/api/health/details") return route.fulfill({ json: { services: {} } });
    return route.fulfill({ json: pathname === "/api/branding" ? {} : [] });
  });
  await page.goto("/admin#rules");
  await page.getByRole("button", { name: /Add.*rule/i }).click();
  const drawer = page.locator(".drawer");
  await drawer.locator("select").nth(0).selectOption(group.id);
  await drawer.locator("select").nth(1).selectOption(space.id);
  const category = drawer.getByRole("combobox", { name: "Category", exact: true });
  await category.selectOption(space.categories[1].id);
  await drawer.locator("select").nth(1).selectOption("");
  await expect(category).toHaveValue(""); await expect(category).toBeDisabled();
  await drawer.locator("select").nth(1).selectOption(space.id);
  await category.selectOption(space.categories[1].id);
  await drawer.locator('input[type="checkbox"]').nth(1).check();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saved?.categoryId).toBe(space.categories[1].id);
  expect(saved?.read).toBe(true);
  expect(saved?.spaceId).toBe(space.id);
});
