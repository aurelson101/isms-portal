import { expect, test } from "./test";
import { test as faultTest } from "@playwright/test";

for (const scope of ["admin", "moderator"]) {
  test(`${scope} keeps unsaved metadata when a concurrent edit is rejected`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [], permissions: { edit: true, upload: true } };
    const document = { id: "document", updatedAt: "2026-01-01T00:00:00.000Z", status: "PUBLISHED", space, category: null, translations: [{ locale: "en", title: "Policy", description: "Original" }], versions: [{ id: "version", locale: "en", version: 1 }] };
    let saves = 0;
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, locale: "en", authentication: { source: "local", diagnostics: {} } } });
      if (path === "/api/me") return route.fulfill({ json: { isModerator: true, locale: "en", spaces: [space] } });
      if (path.endsWith("/spaces")) return route.fulfill({ json: [space] });
      if (path === "/api/admin/documents" || path === "/api/documents") return route.fulfill({ json: { items: [document], total: 1, page: 1, totalPages: 1 } });
      if (path.endsWith("/metadata")) {
        saves++;
        expect(route.request().postDataJSON().expectedUpdatedAt).toBe(document.updatedAt);
        return route.fulfill({ status: 409, json: { code: "DOCUMENT_CHANGED", message: "Document changed" } });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto(scope === "admin" ? "/admin#documents" : "/moderator");
    await page.locator(scope === "admin" ? ".document-actions button" : ".document-action.moderator-icon-action").first().click();
    const form = page.locator(scope === "admin" ? "#document-metadata-form" : "#moderator-metadata-form");
    await form.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved title");
    await form.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/Your fields are preserved/)).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Unsaved title");
    expect(saves).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

faultTest("admin guards duplicate uploads and retains the same request ID on retry", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "space", nameFr: "Documents", nameEn: "Documents", categories: [] };
  const ids: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, locale: "en", authentication: { source: "local", diagnostics: {} } } });
    if (path.endsWith("/spaces")) return route.fulfill({ json: [space] });
    if (path === "/api/admin/documents" && route.request().method() === "POST") {
      const match = route.request().postData()?.match(/name="uploadRequestId"\r\n\r\n([^\r]+)/);
      expect(match).not.toBeNull(); ids.push(match![1]);
      if (ids.length === 1) { await gate; return route.fulfill({ status: 503, json: { message: "Temporary failure" } }); }
      return route.fulfill({ json: { id: "uploaded" } });
    }
    if (path === "/api/admin/documents") return route.fulfill({ json: { items: [], total: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin#documents");
  const form = page.locator("#document-upload-form");
  await form.locator('select[name="spaceId"]').selectOption("space");
  await form.locator('input[name="title"]').fill("Retry guide");
  await form.locator('input[type="file"]').setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 fixture") });
  await form.evaluate(element => { for (let i = 0; i < 2; i++) element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await expect.poll(() => ids.length).toBe(1);
  await expect(form.locator('button[type="submit"], button.primary')).toBeDisabled();
  release();
  await expect(page.getByText("Temporary failure", { exact: true })).toBeVisible();
  await expect(form.locator('input[name="title"]')).toHaveValue("Retry guide");
  await form.locator("button.primary").click();
  await expect.poll(() => ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(form.locator('input[name="title"]')).toHaveValue("");
  expect(errors).toEqual([]);
});
