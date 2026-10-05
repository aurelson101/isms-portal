import { expect, test } from "@playwright/test";

const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
const files = ["policy.pdf", "guide.pdf"].map((name) => ({ name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\nTest") }));
for (const width of [320, 768, 1280]) {
  test(`batch import, publication and summary recovery at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const uploads: string[] = []; const summaries: string[][] = []; const publications: string[] = []; const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const space = { id: "space", nameFr: "Documents", nameEn: "Documents", permissions: { upload: true, edit: true, publish: true, archive: true }, categories: [{ id: "category", parentId: null, nameFr: "Guides", nameEn: "Guides" }] };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { isAdmin: false, isModerator: true, locale: "en", spaces: [space] } });
      if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
      if (path === "/api/documents/upload") { uploads.push(route.request().postData()!); return route.fulfill({ json: { id: ids[uploads.length - 1], status: "DRAFT" } }); }
      if (path.endsWith("/publish")) { publications.push(path); return route.fulfill({ json: { status: "PUBLISHED" } }); }
      if (path === "/api/documents/publication-digest") { summaries.push(route.request().postDataJSON().documentIds); return route.fulfill({ status: summaries.length === 1 ? 503 : 200, json: summaries.length === 1 ? { message: "Queue temporarily unavailable" } : { queued: true } }); }
      return route.fulfill({ json: [] });
    });
    await page.goto("/moderator");
    const batch = page.locator(".batch-import");
    await batch.getByRole("button", { name: "Import a batch" }).click();
    await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
    await batch.getByRole("combobox", { name: "Category", exact: true }).selectOption("category");
    await batch.getByRole("combobox", { name: "File language", exact: true }).selectOption("en");
    await batch.getByLabel("Publish after scanning").check();
    await batch.locator('input[type="file"]').setInputFiles(files);
    await batch.getByRole("button", { name: "Process batch" }).click();
    await expect(batch.getByRole("alert")).toHaveText("Queue temporarily unavailable");
    expect(uploads).toHaveLength(2); expect(publications).toHaveLength(2);
    expect(uploads.every((body) => body.includes('name="suppressEmailNotifications"\r\n\r\ntrue'))).toBe(true);
    await expect(batch.getByRole("button", { name: "Process batch" })).toBeDisabled();
    await batch.getByRole("button", { name: "Retry summary" }).click();
    await expect(batch.getByText("Summary queued for delivery.")).toBeVisible();
    expect(summaries).toEqual([ids, ids]); expect(uploads).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("batch-import.png"), fullPage: true });
  });
}
test("does not reupload a document when publication alone fails", async ({ page }) => {
  let uploads = 0; let publications = 0; let summaries = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: { isModerator: true, locale: "en", spaces: [{ id: "space", nameEn: "Documents", permissions: { upload: true, publish: true, edit: true } }] } });
    if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
    if (path === "/api/documents/upload") { uploads++; return route.fulfill({ json: { id: ids[0], status: "DRAFT" } }); }
    if (path.endsWith("/publish")) { publications++; return route.fulfill({ status: publications === 1 ? 409 : 200, json: publications === 1 ? { message: "Publication failed" } : {} }); }
    if (path === "/api/documents/publication-digest") { summaries++; return route.fulfill({ json: { queued: true } }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/moderator"); const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click(); await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
  await batch.getByLabel("Publish after scanning").check(); await batch.locator('input[type="file"]').setInputFiles(files[0]);
  await batch.getByRole("button", { name: "Process batch" }).click(); await expect(batch.getByText("Publication failed")).toBeVisible();
  await batch.getByRole("button", { name: "Process batch" }).click(); await expect(batch.getByText("Summary queued for delivery.")).toBeVisible();
  expect(uploads).toBe(1); expect(publications).toBe(2); expect(summaries).toBe(1);
});
test("leaves an uncertain upload for manual verification without creating a duplicate", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: { isModerator: true, locale: "en", spaces: [{ id: "space", nameEn: "Documents", permissions: { upload: true } }] } });
    if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
    if (path === "/api/documents/upload") { uploads++; return route.abort("failed"); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/moderator"); const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click(); await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
  await batch.locator('input[type="file"]').setInputFiles(files[0]); await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Check before retry")).toBeVisible(); await expect(batch.getByRole("button", { name: "Process batch" })).toBeDisabled(); expect(uploads).toBe(1);
});
test("admin batch import enforces the file limit and silent publication", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [], permissions: { upload: true, publish: true } };
  let uploads = 0; let summaries = 0; let publications = 0;
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test administrator", locale: "en", authentication: { source: "local", diagnostics: { groupCount: 0, mappedSpaceCount: 1 } } } });
    if (path === "/api/me") return route.fulfill({ json: { isAdmin: true, locale: "en", spaces: [space] } });
    if (path === "/api/admin/dashboard") return route.fulfill({ json: { groups: 0, spaces: 1, documents: 0, syncErrors: 0, attention: { total: 0 } } });
    if (path.endsWith("/spaces")) return route.fulfill({ json: [space] });
    if (path === "/api/admin/documents") return route.fulfill({ json: { items: [], total: 0 } });
    if (path === "/api/documents/upload") { uploads++; return route.fulfill({ json: { id: ids[0], status: "DRAFT" } }); }
    if (path.endsWith("/publish")) { publications++; return route.fulfill({ json: {} }); }
    if (path === "/api/documents/publication-digest") { summaries++; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin#documents"); const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click();
  await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
  await batch.locator('input[type="file"]').setInputFiles(Array.from({ length: 201 }, (_, index) => ({ ...files[0], name: `policy-${index}.pdf` })));
  await expect(batch.getByRole("alert")).toHaveText("Maximum 200 files per batch."); expect(uploads).toBe(0);
  await batch.locator('input[type="file"]').setInputFiles(files[0]);
  await batch.getByRole("combobox", { name: "Email notifications", exact: true }).selectOption("none");
  await batch.getByLabel("Publish after scanning").check();
  await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Batch processing complete.")).toBeVisible();
  expect(uploads).toBe(1); expect(publications).toBe(1); expect(summaries).toBe(0); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
