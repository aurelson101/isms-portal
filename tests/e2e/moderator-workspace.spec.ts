import { expect, test } from "./test";

for (const width of [320, 768, 1440]) {
  test(`moderator layout and four interface languages at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const space = { id: "space", nameFr: "Documents", nameEn: "Documents", permissions: { edit: true, publish: true, archive: true } };
    const document = { id: "document", status: "DRAFT", space, category: null, translations: [{ locale: "en", title: "A document with a long title for responsive moderator management", description: "" }], versions: [{ id: "version", locale: "en", version: 1 }] };
    const queries: string[] = [];
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      if (path === "/api/documents") queries.push(url.searchParams.get("q") || "");
      if (path === "/api/documents/document/publish") document.status = "PUBLISHED";
      await route.fulfill({ json: path === "/api/me" ? { isAdmin: false, isModerator: true, spaces: [space] }
        : path === "/api/documents" ? { items: [document], page: 1, totalPages: 2 }
        : path.endsWith("/categories") ? [] : {} });
    });
    await page.goto("/moderator");
    const languages = [
      ["FR", "Espace modérateur", "Documents gérés", "Éditer les métadonnées", "Document mis à jour."],
      ["EN", "Moderator workspace", "Managed documents", "Edit metadata", "Document updated."],
      ["ES", "Espacio del moderador", "Documentos gestionados", "Editar metadatos", "Documento actualizado."],
      ["SK", "Priestor moderátora", "Spravované dokumenty", "Upraviť metadáta", "Dokument bol aktualizovaný."],
    ];
    for (const [locale, heading, documents] of languages) {
      await page.getByRole("button", { name: locale, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: documents, exact: true })).toBeVisible();
      const toggle = page.locator(".navigation-toggle");
      const navigation = page.locator("#moderator-navigation");
      if (width <= 900) {
        await expect(navigation).toBeHidden();
        await expect(page.locator("aside .back-link")).toBeHidden();
        await toggle.click();
        await expect(navigation).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(navigation).toBeHidden();
        await expect(toggle).toBeFocused();
        await toggle.click();
      } else {
        await expect(navigation).toBeVisible();
        await expect(toggle).toBeHidden();
      }
      await expect(navigation.locator("a")).toHaveCount(3);
      const back = page.locator(".moderator-shell > aside .back-link");
      await expect(back).toHaveAttribute("href", "/explorer");
      await expect(back).toHaveCSS("text-decoration-line", "none");
      await expect(back).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator(".document-actions button").evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth + 1))).toBe(true);
      await navigation.locator('a[href="#moderator-permissions"]').click();
      await expect(page).toHaveURL(/#moderator-permissions$/);
      await expect(navigation.locator('a[aria-current="location"]')).toHaveAttribute("href", "#moderator-permissions");
      await expect(page.locator(".moderator-permissions strong")).toHaveText("Documents");
      await page.locator(".moderator-permissions > summary").click();
      if (width <= 900) await toggle.click();
      await navigation.locator('a[href="#moderator-import"]').click();
      await expect(page).toHaveURL(/#moderator-import$/);
      if (width <= 900) await toggle.click();
      await navigation.locator('a[href="#moderator-documents"]').click();
      await expect(page).toHaveURL(/#moderator-documents$/);
      if (width <= 900) await expect(navigation).toBeHidden();
      await page.screenshot({ path: info.outputPath(`moderator-${locale}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByRole("search").getByRole("searchbox").fill("policy");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();
    expect(queries.at(-1)).toBe("policy");
    await page.getByRole("searchbox").fill("");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);
    expect(queries.at(-1)).toBe("");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    for (const [locale, , , , notice] of languages) {
      await page.getByRole("button", { name: locale, exact: true }).click();
      await expect(page.locator(".notice[role=status]")).toHaveText(notice);
    }
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    for (const [locale, , , metadata] of languages) {
      await page.getByRole("button", { name: locale, exact: true }).click();
      await expect(page.locator("#moderator-metadata-form h2")).toHaveText(metadata);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

for (const width of [320, 768, 1280]) {
  test(`moderator actions and upload recovery at ${width}px`, async ({ page }, info) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.setViewportSize({ width, height: 900 });
    const space = { id: "space", nameFr: "Documents", nameEn: "Documents", permissions: { edit: true, publish: true, archive: true } };
    const document = { id: "document", status: "DRAFT", space, category: { id: "category", nameFr: "Voyage", nameEn: "Travel" }, translations: [{ locale: "fr", title: "Politique", description: "Description FR" }, { locale: "en", title: "Test policy with a longer title for responsive document management", description: "" }], versions: [{ id: "old-version", locale: "fr", version: 1 }, { id: "version", locale: "en", version: 2 }] };
    let documentRequests = 0;
    let clampPage = false;
    let metadataPayload: Record<string, unknown> = {};
    let releasePublish!: () => void;
    const publishGate = new Promise<void>((resolve) => { releasePublish = resolve; });
    let releaseCategories!: () => void;
    const categoriesGate = new Promise<void>((resolve) => { releaseCategories = resolve; });
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
      } else if (url.pathname === "/api/documents/document/categories") {
        await categoriesGate;
        await route.fulfill({ json: [] });
      } else if (url.pathname === "/api/documents/document/metadata") {
        metadataPayload = route.request().postDataJSON();
        await route.fulfill({ json: {} });
      } else if (url.pathname === "/api/documents/document/restore") {
        document.status = "DRAFT";
        await route.fulfill({ json: {} });
      } else if (url.pathname === "/api/documents") {
        documentRequests++;
        await route.fulfill({ json: { items: [document], page: clampPage ? 1 : Number(url.searchParams.get("page")), totalPages: 2 } });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.goto("/moderator");
    await expect(page.locator("table")).toContainText("Travel");
    await expect(page.locator("table")).toContainText("v2");
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
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "New version", exact: true })).toBeDisabled();
    releaseCategories();
    const metadata = page.locator("#moderator-metadata-form");
    await expect(metadata.getByLabel("Document language")).toHaveValue("en");
    await expect(metadata.getByLabel("Description", { exact: true })).toHaveValue("");
    await expect(metadata.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    await expect(metadata.getByLabel("Document language")).toBeFocused();
    await metadata.getByRole("button", { name: "Save", exact: true }).click();
    await expect(metadata).toHaveCount(0);
    expect(metadataPayload).toMatchObject({ locale: "en", versionId: "version", categoryId: "category", description: "" });
    const beforeRefresh = documentRequests;
    clampPage = true;
    document.status = "ARCHIVED";
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("button", { name: "Restore", exact: true })).toBeEnabled();
    await expect(page.getByRole("navigation", { name: "Document pagination" })).toContainText("Page 1 of 2");
    expect(documentRequests - beforeRefresh).toBe(1);
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(page.locator("table")).toContainText("Draft");
    await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("moderator.png"), fullPage: true });
  });
}

for (const width of [320, 768, 1280]) {
  test(`shared admin login, language and SSO at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    await page.route("**/api/**", (route) => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/auth/config"
      ? { directoryLoginEnabled: true, ssoEnabled: true, ssoPilotUrl: "/oauth2/start?rd=/", ssoLoginUrl: null } : {} }));
    await page.goto("/admin/login?return=%2Fadministrator");
    await expect(page.getByRole("link", { name: "Continue with Microsoft" })).toHaveAttribute("href", "/oauth2/start?rd=%2Fadmin");
    await page.getByRole("button", { name: "FR", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Connexion administrateur" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Administrator sign in" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("admin-login.png"), fullPage: true });
    await page.locator(".login-alternative > summary").click();
    await page.getByLabel("Administrator username", { exact: true }).fill("admin@example.test");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    await page.route("http://127.0.0.1:3100/admin", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Administration</h1>" }));
    await page.getByRole("button", { name: "Sign in to administration", exact: true }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/admin");
  });
}

for (const [requested, expected] of [["/moderator", "/moderator"], ["/\\external.example", "/"]]) {
  test(`AD and SSO use a safe return path for ${requested}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ json: path === "/api/auth/config"
        ? { directoryLoginEnabled: true, ssoEnabled: true, ssoPilotUrl: "/oauth2/start?rd=/", ssoLoginUrl: null }
        : {} });
    });
    await page.goto(`/login?return=${encodeURIComponent(requested)}`);
    await expect(page.getByRole("link", { name: "Continue with Microsoft" })).toHaveAttribute("href", `/oauth2/start?rd=${encodeURIComponent(expected)}`);
    await page.locator(".login-alternative > summary").click();
    await page.getByLabel("Identifier", { exact: true }).fill("moderator@example.test");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    await page.route(`http://127.0.0.1:3100${expected}`, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Destination</h1>" }));
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:3100${expected}`);
    await expect(page.getByRole("heading", { name: "Destination" })).toBeVisible();
  });
}
