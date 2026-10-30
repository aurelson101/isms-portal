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
    const status = page.locator(".document-status-select");
    await expect(status).toHaveValue("PUBLISHED");
    expect(await status.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.locator(".document-actions button").first().click();
    const form = page.locator("#document-metadata-form");
    await form.getByRole("textbox", { name: "Reference", exact: true }).fill("POL-002");
    await form.getByRole("combobox", { name: "Field name", exact: true }).fill("Reference");
    await expect(form.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
    await form.getByRole("combobox", { name: "Field name", exact: true }).fill("Owner");
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
    await page.locator(".document-actions button").first().click();
    await form.getByRole("combobox", { name: "Metadata template", exact: true }).selectOption("procedure");
    await form.getByRole("button", { name: "Complete metadata", exact: true }).click();
    await expect(form.getByRole("textbox", { name: "Reference", exact: true })).toHaveCount(1);
    await expect(form.getByRole("textbox", { name: "Reference", exact: true })).toHaveValue("POL-002");
    await expect(form.getByRole("combobox", { name: "Document type", exact: true })).toHaveValue("procedure");
    await expect(form.getByRole("button", { name: "Complete metadata", exact: true })).toBeDisabled();
    await form.getByRole("textbox", { name: "Owner", exact: true }).fill("Quality");
    await form.getByRole("textbox", { name: "Keywords", exact: true }).fill("compliance, security");
    await form.getByLabel("Review date", { exact: true }).fill("2028-02-29");
    await form.getByRole("combobox", { name: "Field name", exact: true }).fill("Process");
    await form.getByRole("combobox", { name: "Field name", exact: true }).press("Enter");
    await expect(form.getByRole("textbox", { name: "Process", exact: true })).toBeVisible();
    expect(saved).toHaveLength(2);
    await form.getByRole("button", { name: "Delete Process", exact: true }).click();
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(saved[2].metadata).toEqual({ Reference: "POL-002", "ged.documentType": "procedure", "ged.owner": "Quality", "ged.keywords": "compliance, security", "ged.reviewDate": "2028-02-29" });
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

test("space branches collapse and ACL filters include nested categories", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const rule = { id: "rule", group, space, categoryId: space.categories[1].id, category: space.categories[1], read: true };
  await page.route("**/api/**", async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", locale: "en", authentication: {} } });
    if (pathname === "/api/admin/spaces") return route.fulfill({ json: [space] });
    if (pathname === "/api/admin/groups") return route.fulfill({ json: [group] });
    if (pathname === "/api/admin/access-rules") return route.fulfill({ json: [rule] });
    if (pathname === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
    if (pathname === "/api/admin/dashboard") return route.fulfill({ json: null });
    if (pathname === "/api/health/details") return route.fulfill({ json: { services: {} } });
    return route.fulfill({ json: pathname === "/api/branding" ? {} : [] });
  });
  await page.goto("/admin#spaces");
  const branch = page.getByRole("button", { name: "Test space", exact: true });
  await branch.click();
  await expect(page.locator(".space-category-list")).toBeHidden();
  await branch.click();
  const parent = page.getByRole("button", { name: "Category : Parent", exact: true });
  await parent.click();
  await expect(page.locator(".space-category-name strong", { hasText: "Child" })).toHaveCount(0);
  await parent.click();
  await expect(page.locator(".space-category-name strong", { hasText: "Child" })).toBeVisible();
  await page.goto("/admin#rules");
  const scope = page.getByRole("combobox", { name: "Space", exact: true });
  await scope.selectOption(`${space.id}:${space.categories[1].id}`);
  await expect(page.getByRole("button", { name: "Edit Readers", exact: true })).toBeVisible();
  await scope.selectOption(`${space.id}:${space.categories[0].id}`);
  await expect(page.getByText("No access rule matches this search.", { exact: true })).toBeVisible();
});
