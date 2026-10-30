import { expect, test } from "./test";
import { PDFDocument } from "pdf-lib";

for (const width of [390, 768, 1440, 2560, 3840]) {
  test(`document information stays compact and readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const space = { id: "space", slug: "general", nameFr: "General", nameEn: "General", categories: [], permissions: { read: true, search: true } };
    const document = { id: "document", slug: "test-policy", status: "PUBLISHED", space, category: null, reviews: [], viewCount: 0, downloadCount: 0, metadata: { "ged.owner": "Owner " + "x".repeat(200), "ged.keywords": "SSO; sso, ;\nSSO", "ged.documentType": "policy" }, translations: [{ locale: "en", title: "Test policy", description: "" }], versions: [{ id: "version", locale: "en", version: 1, storedFile: { mimeType: "application/pdf" } }], permissions: { read: true, preview: false, download: false }, favorite: false };
    document.permissions.preview = true;
    const pdf = await PDFDocument.create(); pdf.addPage();
    const preview = Buffer.from(await pdf.save());
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me") return route.fulfill({ json: { username: "reader@example.test", displayName: "Reader", locale: "en", isAdmin: false, isModerator: false, spaces: [space], authentication: { source: "local" } } });
      if (path === "/api/documents") return route.fulfill({ json: { items: [document], page: 1, total: 1, totalPages: 1 } });
      if (path === "/api/documents/document") return route.fulfill({ json: document });
      if (path.includes("/preview")) return route.fulfill({ body: preview, contentType: "application/pdf" });
      return route.fulfill({ json: path === "/api/branding" ? {} : [] });
    });
    await page.goto("/explorer");
    await page.getByRole("button", { name: "Open", exact: true }).first().click({ timeout: 12000 });
    const information = page.locator(".document-reader-information");
    if (!await information.evaluate((element: HTMLDetailsElement) => element.open)) await information.locator("summary").click();
    const fields = information.locator(".document-reader-custom-field");
    await expect(fields).toHaveCount(3);
    await expect(information.locator(".document-metadata-keywords a")).toHaveCount(1);
    await expect(information.locator(".document-metadata-keywords a")).toHaveAttribute("href", "/explorer?q=SSO");
    expect(await information.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    if (width >= 768) {
      const tops = await fields.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
    }
    if (width === 1440) {
      await information.screenshot({ path: testInfo.outputPath("document-information.png") });
      document.metadata["ged.keywords"] = ", ;\n";
      await page.goto("/explorer");
      await page.getByRole("button", { name: "Open", exact: true }).first().click();
      await expect(information.locator(".document-reader-custom-field")).toHaveCount(2);
    }
  });
}
