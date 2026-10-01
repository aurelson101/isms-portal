import { expect, test } from "./test";

for (const width of [390, 768, 1280]) {
  test(`moderator actions and upload recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const space = { id: "space", nameFr: "Documents", nameEn: "Documents", permissions: { edit: true, publish: true, archive: true } };
    const document = { id: "document", status: "DRAFT", space, category: null, translations: [{ locale: "en", title: "Test policy", description: "" }], versions: [{ id: "version", locale: "en", version: 1 }] };
    let releasePublish!: () => void;
    const publishGate = new Promise<void>((resolve) => { releasePublish = resolve; });
    let publishRequests = 0;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/me") {
        await route.fulfill({ json: { displayName: "Test moderator", username: "moderator@example.test", isAdmin: false, isModerator: true, locale: "en", spaces: [space] } });
      } else if (url.pathname === "/api/documents/document/publish") {
        publishRequests++;
        await publishGate;
        document.status = "PUBLISHED";
        await route.fulfill({ json: {} });
      } else if (url.pathname === "/api/documents/upload") {
        await route.fulfill({ status: 409, json: { message: "Upload rejected" } });
      } else if (url.pathname === "/api/documents") {
        await route.fulfill({ json: { items: [document], page: Number(url.searchParams.get("page")), totalPages: 2 } });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.goto("/moderator");
    const publish = page.getByRole("button", { name: "Publish", exact: true });
    const next = page.getByRole("navigation", { name: "Document pagination" }).getByRole("button", { name: /Next/ });
    await publish.click();
    await expect(publish).toBeDisabled();
    await expect(next).toBeDisabled();
    await expect(page.getByRole("button", { name: "New version", exact: true })).toBeDisabled();
    expect(publishRequests).toBe(1);
    releasePublish();
    await expect(page.locator(".notice[role=status]")).toHaveText("Document updated.");
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByRole("navigation", { name: "Document pagination" })).toContainText("Page 2 of 2");
    await expect(page.getByRole("button", { name: "New version", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "New version", exact: true }).click();
    await page.getByLabel("Change summary").fill("Updated policy");
    const file = page.getByLabel("File", { exact: true });
    await file.setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
    await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
    await expect(page.locator(".error-state[role=alert]")).toHaveText("Upload rejected");
    await expect(page.getByRole("button", { name: "Upload and scan", exact: true })).toBeEnabled();
    await expect(page.getByLabel("Change summary")).toHaveValue("Updated policy");
    expect(await file.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("policy.pdf");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
