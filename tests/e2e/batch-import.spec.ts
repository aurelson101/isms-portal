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
    await page.goto("/moderator#moderator-import");
    const batch = page.locator(".batch-import");
    await batch.getByRole("button", { name: "Import a batch" }).click();
    await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
    await batch.getByRole("combobox", { name: "Category", exact: true }).selectOption("category");
    await batch.getByRole("combobox", { name: "File language", exact: true }).selectOption("en");
    await batch.getByLabel("Publish after scanning").check();
    await batch.getByLabel("Shared description (optional)", { exact: true }).fill("Common document description");
    await expect(batch.getByRole("textbox", { name: "Shared description (optional)", exact: true })).toHaveAttribute("maxlength", "2000");
    await batch.locator('input[type="file"]').setInputFiles(files);
    await expect(batch.locator(".batch-items li").nth(1).getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Common document description");
    await expect(batch.locator(".batch-items li").nth(1).getByRole("textbox", { name: "Description", exact: true })).toHaveAttribute("maxlength", "2000");
    await batch.locator(".batch-items li").first().getByRole("textbox", { name: "Description", exact: true }).fill("Specific policy description");
    await batch.getByRole("button", { name: "Process batch" }).click();
    await expect(batch.getByRole("alert")).toHaveText("Queue temporarily unavailable");
    expect(uploads).toHaveLength(2); expect(publications).toHaveLength(2);
    expect(uploads.every((body) => body.includes('name="suppressEmailNotifications"\r\n\r\ntrue'))).toBe(true);
    expect(uploads[0]).toContain('name="description"\r\n\r\nSpecific policy description');
    expect(uploads[1]).toContain('name="description"\r\n\r\nCommon document description');
    await expect(batch.locator(".batch-items li").first().getByRole("textbox", { name: "Description", exact: true })).toBeDisabled();
    await expect(batch.getByRole("button", { name: "Process batch" })).toBeDisabled();
    await batch.getByRole("button", { name: "Retry summary" }).click();
    await expect(batch.getByText("Summary queued for delivery.")).toBeVisible();
    expect(summaries).toEqual([ids, ids]); expect(uploads).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("batch-import.png"), fullPage: true });
    await batch.getByRole("button", { name: "New batch" }).click();
    await expect(batch.getByRole("textbox", { name: "Shared description (optional)", exact: true })).toHaveValue("");
  });
}
test("imports and publishes all 200 files with one publication summary", async ({ page }) => {
  test.setTimeout(120000);
  const batchIds = Array.from({ length: 200 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  let uploads = 0;
  const publications: string[] = [];
  const summaries: string[][] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: { isModerator: true, locale: "en", spaces: [{ id: "space", nameEn: "Documents", permissions: { upload: true, publish: true, edit: true } }] } });
    if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
    if (path === "/api/documents/upload") {
      const body = route.request().postData()!;
      expect(body).toContain('name="description"\r\n\r\nFull batch description');
      expect(body).toContain('name="suppressEmailNotifications"\r\n\r\ntrue');
      return route.fulfill({ json: { id: batchIds[uploads++], status: "DRAFT" } });
    }
    if (path.endsWith("/publish")) { publications.push(path); return route.fulfill({ json: { status: "PUBLISHED" } }); }
    if (path === "/api/documents/publication-digest") { summaries.push(route.request().postDataJSON().documentIds); return route.fulfill({ json: { queued: true } }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/moderator#moderator-import");
  const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click();
  await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
  await batch.getByRole("textbox", { name: "Shared description (optional)", exact: true }).fill("Full batch description");
  await batch.getByLabel("Publish after scanning").check();
  await batch.locator('input[type="file"]').setInputFiles(batchIds.map((_, index) => ({ ...files[0], name: `policy-${index + 1}.pdf` })));
  await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Summary queued for delivery.")).toBeVisible({ timeout: 90000 });
  expect(uploads).toBe(200);
  expect(new Set(publications).size).toBe(200);
  expect(summaries).toEqual([batchIds]);
  await expect(batch.getByText("Published", { exact: true })).toHaveCount(200);
  await expect(batch.getByRole("progressbar")).toHaveAttribute("value", "200");
  expect(errors).toEqual([]);
});

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
  await page.goto("/moderator#moderator-import"); const batch = page.locator(".batch-import");
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
  await page.goto("/moderator#moderator-import"); const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click(); await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
  await batch.locator('input[type="file"]').setInputFiles(files[0]); await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Check before retry")).toBeVisible(); await expect(batch.getByRole("button", { name: "Process batch" })).toBeDisabled(); expect(uploads).toBe(1);
});
test("switching to an upload-only space clears publication and sends no summary", async ({ page }) => {
  let uploads = 0; let publications = 0; let summaries = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: { isModerator: true, spaces: [
      { id: "publish", nameEn: "Publish", permissions: { upload: true, publish: true } },
      { id: "draft", nameEn: "Draft", permissions: { upload: true, publish: false } },
    ] } });
    if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
    if (path === "/api/documents/upload") {
      uploads++;
      expect(route.request().postData()).toContain('name="spaceId"\r\n\r\ndraft');
      return route.fulfill({ json: { id: ids[0], status: "DRAFT" } });
    }
    if (path.endsWith("/publish")) { publications++; return route.fulfill({ json: {} }); }
    if (path === "/api/documents/publication-digest") { summaries++; return route.fulfill({ json: {} }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/moderator#moderator-import"); const batch = page.locator(".batch-import");
  await batch.getByRole("button", { name: "Import a batch" }).click();
  const space = batch.getByRole("combobox", { name: "Space", exact: true });
  await space.selectOption("publish");
  await batch.getByLabel("Publish after scanning").check();
  await space.selectOption("draft");
  await expect(batch.getByLabel("Publish after scanning")).not.toBeChecked();
  await expect(batch.getByLabel("Publish after scanning")).toBeDisabled();
  await batch.locator('input[type="file"]').setInputFiles(files[0]);
  await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Batch processing complete.")).toBeVisible();
  expect(uploads).toBe(1); expect(publications).toBe(0); expect(summaries).toBe(0);
});

for (const documentId of ["", " "]) {
  test(`an invalid upload identifier ${JSON.stringify(documentId)} prevents publication and duplicate retry`, async ({ page }) => {
    let uploads = 0; let publications = 0; let summaries = 0;
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { isModerator: true, spaces: [{ id: "space", nameEn: "Documents", permissions: { upload: true, publish: true } }] } });
      if (path === "/api/documents") return route.fulfill({ json: { items: [], page: 1, totalPages: 1 } });
      if (path === "/api/documents/upload") { uploads++; return route.fulfill({ json: { id: documentId, status: "DRAFT" } }); }
      if (path.endsWith("/publish")) { publications++; return route.fulfill({ json: {} }); }
      if (path === "/api/documents/publication-digest") { summaries++; return route.fulfill({ json: {} }); }
      return route.fulfill({ json: [] });
    });
    await page.goto("/moderator#moderator-import"); const batch = page.locator(".batch-import");
    await batch.getByRole("button", { name: "Import a batch" }).click();
    await batch.getByRole("combobox", { name: "Space", exact: true }).selectOption("space");
    await batch.getByLabel("Publish after scanning").check();
    await batch.locator('input[type="file"]').setInputFiles(files[0]);
    await batch.getByRole("button", { name: "Process batch" }).click();
    await expect(batch.getByText("Check before retry")).toBeVisible();
    await expect(batch.getByRole("button", { name: "Process batch" })).toBeDisabled();
    expect(uploads).toBe(1); expect(publications).toBe(0); expect(summaries).toBe(0);
  });
}

test("admin batch import enforces the file limit and silent publication", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [], permissions: { upload: true, publish: true } };
  let uploads = 0; let summaries = 0; let publications = 0; let uploadBody = "";
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test administrator", locale: "en", authentication: { source: "local", diagnostics: { groupCount: 0, mappedSpaceCount: 1 } } } });
    if (path === "/api/me") return route.fulfill({ json: { isAdmin: true, locale: "en", spaces: [space] } });
    if (path === "/api/admin/dashboard") return route.fulfill({ json: { groups: 0, spaces: 1, documents: 0, syncErrors: 0, attention: { total: 0 } } });
    if (path.endsWith("/spaces")) return route.fulfill({ json: [space] });
    if (path === "/api/admin/documents") return route.fulfill({ json: { items: [], total: 0 } });
    if (path === "/api/documents/upload") { uploads++; uploadBody = route.request().postData()!; return route.fulfill({ json: { id: ids[0], status: "DRAFT" } }); }
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
  await batch.getByLabel("Shared description (optional)", { exact: true }).fill("Admin description");
  await batch.getByLabel("Publish after scanning").check();
  await batch.getByRole("button", { name: "Process batch" }).click();
  await expect(batch.getByText("Batch processing complete.")).toBeVisible();
  expect(uploads).toBe(1); expect(publications).toBe(1); expect(summaries).toBe(0); expect(errors).toEqual([]);
  expect(uploadBody).toContain('name="description"\r\n\r\nAdmin description');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
