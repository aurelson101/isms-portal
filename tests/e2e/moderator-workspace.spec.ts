import { expect, test } from "./test";

test("moderator warns before discarding a metadata field deletion", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "it", nameFr: "IT", nameEn: "IT", permissions: { edit: true } };
  const document = { id: "doc", status: "DRAFT", space, category: null, metadata: { Reference: "POL-001" }, translations: [{ locale: "en", title: "Policy" }], versions: [] };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/me" ? { isModerator: true, spaces: [space] }
      : path.endsWith("/categories") ? [] : { items: [document], page: 1, totalPages: 1 } });
  });
  await page.goto("/moderator");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.locator("#moderator-metadata-form");
  await form.getByRole("button", { name: "Delete Reference", exact: true }).click();
  let warnings = 0;
  page.once("dialog", async dialog => { warnings++; await dialog.dismiss(); });
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toBeVisible();
  expect(warnings).toBe(1);
  await expect(form.getByRole("textbox", { name: "Reference", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(form).toHaveCount(0);
});

test("moderator version forms discard the previous document file and summary", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "it", nameFr: "IT", nameEn: "IT", permissions: { edit: true } };
  const documents = ["First", "Second"].map((title, index) => ({ id: String(index), status: "DRAFT", space, category: null, translations: [{ locale: "en", title }], versions: [{ id: `v${index}`, locale: "en", version: 1 }] }));
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/me"
    ? { isModerator: true, spaces: [space] } : { items: documents, page: 1, totalPages: 1 } }));
  await page.goto("/moderator");
  await page.getByRole("button", { name: "New version", exact: true }).first().click();
  const form = page.locator("#moderator-version-form");
  await form.getByRole("textbox", { name: "Change summary" }).fill("First document changes");
  await form.locator('input[type="file"]').setInputFiles({ name: "first.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await form.getByRole("checkbox").check();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "New version", exact: true }).nth(1).click();
  await expect(form.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Second");
  await expect(form.getByRole("textbox", { name: "Change summary" })).toHaveValue("");
  await expect(form.locator('input[type="file"]')).toHaveValue("");
  await expect(form.getByRole("checkbox")).not.toBeChecked();
});

test("moderator protects an editor from filters and preserves it across menu changes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "it", nameFr: "IT", nameEn: "IT", permissions: { edit: true } };
  const document = { id: "doc", status: "DRAFT", space, category: null, translations: [{ locale: "en", title: "Policy" }], versions: [{ id: "v1", locale: "en", version: 1 }] };
  let lists = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/documents") lists++;
    return route.fulfill({ json: path === "/api/me" ? { isModerator: true, spaces: [space] }
      : path.endsWith("/categories") ? [] : { items: [document], page: 1, totalPages: 1 } });
  });
  await page.goto("/moderator?status=DRAFT");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.locator("#moderator-metadata-form");
  await form.getByRole("textbox", { name: "Title", exact: true }).fill("Unsaved policy");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  const before = lists;
  await page.locator("#moderator-document-search").evaluate((element: HTMLFormElement) => element.requestSubmit());
  expect(lists).toBe(before);
  const imports = page.locator("#moderator-navigation").getByRole("link", { name: "Document import", exact: true });
  await imports.click();
  await expect(page.locator("#moderator-import")).toBeVisible();
  await page.locator("#moderator-navigation").getByRole("link", { name: "Managed documents", exact: true }).click();
  await expect(form).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Unsaved policy");
});

test("moderator cannot switch menus while an editor request is pending", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "it", nameFr: "IT", nameEn: "IT", permissions: { edit: true } };
  const document = { id: "doc", status: "DRAFT", space, category: null, translations: [{ locale: "en", title: "Policy" }], versions: [] };
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/categories")) { await pending; return route.fulfill({ json: [] }); }
    return route.fulfill({ json: path === "/api/me" ? { isModerator: true, spaces: [space] } : { items: [document], page: 1, totalPages: 1 } });
  });
  await page.goto("/moderator");
  const requested = page.waitForRequest("**/api/documents/doc/categories");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await requested;
  await page.locator("#moderator-navigation").getByRole("link", { name: "Document import", exact: true }).click();
  await expect(page.locator("#moderator-documents")).toBeVisible();
  await expect(page.locator("#moderator-import")).toBeHidden();
  release();
  await expect(page.locator("#moderator-metadata-form")).toBeVisible();
});

test("moderator redirects to login when only the document session expires", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill(path === "/api/me" ? { json: { isModerator: true, spaces: [] } }
      : path === "/api/documents" ? { status: 401, json: { message: "Unauthorized" } } : { json: {} });
  });
  await page.goto("/moderator");
  await expect(page).toHaveURL(/\/login\?/);
});

test("moderator localizes a stalled document request timeout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/documents") return;
    return route.fulfill({ json: path === "/api/me" ? { isModerator: true, spaces: [] } : {} });
  });
  await page.goto("/moderator");
  await expect(page.locator('.error-state[role="alert"]')).toContainText("Délai dépassé", { timeout: 20000 });
});

test("moderator shows upload-only permissions without granting document management", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const spaces = [
    { id: "upload", slug: "upload", nameFr: "Upload-only", nameEn: "Upload-only", permissions: { upload: true } },
    { id: "reader", slug: "reader", nameFr: "Read-only", nameEn: "Read-only", permissions: { read: true } },
    { id: "edit", slug: "edit", nameFr: "Edit-only", nameEn: "Edit-only", permissions: { edit: true } },
  ];
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/me"
    ? { isModerator: true, spaces } : { items: [], page: 1, totalPages: 1 } }));
  await page.goto("/moderator#moderator-permissions");
  const permissions = page.locator("#moderator-permissions");
  await expect(permissions.locator("summary span")).toHaveText("2");
  await expect(permissions.locator("strong")).toHaveText(["Upload-only", "Edit-only"]);
  await expect(page.locator("#moderator-navigation").getByRole("link", { name: "Upload-only", exact: true })).toHaveCount(0);
  await expect(page.locator("#moderator-navigation").getByRole("link", { name: "Edit-only", exact: true })).toHaveCount(1);
  for (const [locale, label] of [["FR", "Déposer"], ["EN", "Upload"], ["ES", "Cargar"], ["SK", "Nahrať"]]) {
    await page.getByRole("button", { name: locale, exact: true }).click();
    await expect(permissions.locator(".admin-account-list > div").first().locator("small")).toHaveText(label);
  }
});

test("moderator restores filters and pagination and debounces search", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = { id: "it", slug: "it", nameFr: "IT", nameEn: "IT", permissions: { edit: true } };
  const documents = Array.from({ length: 45 }, (_, index) => ({ id: String(index), status: "DRAFT", space, category: null, translations: [{ locale: "en", title: `Policy ${index + 1}` }], versions: [] }));
  const requests: URLSearchParams[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me") return route.fulfill({ json: { isModerator: true, spaces: [space] } });
    if (url.pathname !== "/api/documents") return route.fulfill({ json: {} });
    requests.push(url.searchParams);
    const filtered = documents.filter(document => document.translations[0].title.toLowerCase().includes((url.searchParams.get("q") || "").toLowerCase()));
    const totalPages = Math.ceil(filtered.length / 20);
    const current = Math.min(Number(url.searchParams.get("page")), Math.max(totalPages, 1));
    return route.fulfill({ json: { items: filtered.slice((current - 1) * 20, current * 20), page: current, totalPages } });
  });
  await page.goto("/moderator?q=Policy&space=it&status=DRAFT&page=2#moderator-documents");
  const search = page.getByRole("searchbox");
  const pagination = page.getByRole("navigation", { name: "Document pagination" });
  await expect(pagination).toContainText("Page 2 of 3");
  await expect(search).toHaveValue("Policy");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("DRAFT");
  await page.reload();
  await expect(pagination).toContainText("Page 2 of 3");
  await expect(page.getByRole("article")).toHaveCount(20);
  const before = requests.length;
  await search.fill("P");
  await search.fill("Po");
  await search.fill("Policy 2");
  await expect(pagination).toContainText("Page 1 of 1");
  await expect(page.getByRole("article")).toHaveCount(11);
  expect(requests.length - before).toBe(1);
  expect(requests.at(-1)?.get("space")).toBe("it");
  expect(requests.at(-1)?.get("status")).toBe("DRAFT");
  expect(new URL(page.url()).searchParams.get("q")).toBe("Policy 2");
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
});

for (const width of [320, 1440]) {
  test(`moderator space menus and twenty-document pagination at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const spaces = ["IT", "HR"].map(name => ({ id: name, slug: name.toLowerCase(), nameFr: name, nameEn: name, permissions: { edit: true } }));
    const documents = Array.from({ length: 45 }, (_, index) => ({ id: String(index), status: index % 3 === 0 ? "DRAFT" : "PUBLISHED", space: spaces[index < 24 ? 0 : 1], category: null, translations: [{ locale: "en", title: `Document ${index + 1}` }], versions: [{ id: `v${index}`, locale: "en", version: 1 }] }));
    const requests: URLSearchParams[] = [];
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/me") return route.fulfill({ json: { isModerator: true, spaces } });
      if (url.pathname !== "/api/documents") return route.fulfill({ json: {} });
      requests.push(url.searchParams);
      const scope = url.searchParams.get("space");
      const status = url.searchParams.get("status");
      const filtered = documents.filter(document => (!scope || document.space.slug === scope) && (!status || document.status === status));
      const current = Number(url.searchParams.get("page"));
      await route.fulfill({ json: { items: filtered.slice((current - 1) * 20, current * 20), page: current, totalPages: Math.ceil(filtered.length / 20) } });
    });
    await page.goto("/moderator");
    const pagination = page.getByRole("navigation", { name: "Document pagination" });
    const next = pagination.getByRole("button", { name: /Next/ });
    const previous = pagination.getByRole("button", { name: /Previous/ });
    await expect(page.getByRole("article")).toHaveCount(20);
    await expect(previous).toBeDisabled();
    await next.click();
    await expect(pagination).toContainText("Page 2 of 3");
    await next.click();
    await expect(page.getByRole("article")).toHaveCount(5);
    await expect(next).toBeDisabled();
    if (width <= 900) await page.locator(".navigation-toggle").click();
    const documentMenu = page.locator("#moderator-navigation > details").first();
    await documentMenu.locator(":scope > summary").click();
    await expect(documentMenu.getByRole("link", { name: "HR", exact: true })).toBeHidden();
    await documentMenu.locator(":scope > summary").click();
    await page.locator("#moderator-navigation").getByRole("link", { name: "HR", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Managed documents : HR", exact: true })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(20);
    await expect(pagination).toContainText("Page 1 of 2");
    const status = page.getByRole("combobox", { name: "Status", exact: true });
    await expect(status).toHaveCSS("min-height", "44px");
    await status.selectOption("DRAFT");
    await expect(page.getByRole("article")).toHaveCount(7);
    await expect(pagination).toContainText("Page 1 of 1");
    expect(requests.at(-1)?.get("space")).toBe("hr");
    expect(requests.at(-1)?.get("status")).toBe("DRAFT");
    await status.selectOption("PUBLISHED");
    await expect(page.getByRole("article")).toHaveCount(14);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(20);
    await expect(status).toHaveValue("");
    expect(requests.at(-1)?.has("status")).toBe(false);
    expect(requests.at(-1)?.get("space")).toBe("hr");
    await next.click();
    await expect(page.getByRole("article")).toHaveCount(1);
    expect(requests.at(-1)?.get("space")).toBe("hr");
    await previous.click();
    await expect(page.getByRole("article")).toHaveCount(20);
    if (width <= 900) await page.locator(".navigation-toggle").click();
    await page.locator("#moderator-navigation").getByRole("link", { name: "Managed documents", exact: true }).click();
    await expect(pagination).toContainText("Page 1 of 3");
    expect(requests.at(-1)?.has("space")).toBe(false);
    expect(requests.every(query => query.get("limit") === "20" && query.get("managed") === "true")).toBe(true);
  });
}

for (const width of [320, 768, 1440, 1920, 2560, 3440, 3840, 5120]) {
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
      await route.fulfill({ json: path === "/api/me" ? { isAdmin: false, isModerator: true, displayName: "Test moderator", username: "moderator@example.test", spaces: [space] }
        : path === "/api/documents" ? { items: [document], page: 1, totalPages: 2 }
        : path.endsWith("/categories") ? [] : {} });
    });
    await page.goto("/moderator");
    await page.locator(".management-view-toggle button").nth(1).click();
    const toolbar = page.locator(".moderator-management-header");
    await expect(toolbar.locator(".admin-language")).toHaveCount(1);
    await expect(toolbar.getByRole("searchbox")).toHaveCount(1);
    await expect(page.locator(".refresh-button")).toHaveCount(1);
    if (width <= 600) await expect(page.locator(".refresh-button")).toHaveCSS("width", "44px");
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    const profile = toolbar.locator(".admin-profile > summary");
    await profile.click();
    await expect(toolbar.locator(".admin-profile-menu")).toBeVisible();
    await expect(toolbar.locator(".admin-profile-menu")).toContainText("moderator@example.test");
    await page.keyboard.press("Escape");
    await expect(toolbar.locator(".admin-profile-menu")).toBeHidden();
    await expect(profile).toBeFocused();
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
      await expect(navigation.locator("a")).toHaveCount(4);
      const back = page.locator(".moderator-shell > aside .back-link");
      await expect(back).toHaveAttribute("href", "/explorer");
      await expect(back).toHaveCSS("text-decoration-line", "none");
      await expect(back).toBeVisible();
      expect(await back.evaluate(element => {
        const icon = element.querySelector("svg")?.getBoundingClientRect();
        const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!icon || !text) return false;
        const range = document.createRange();
        range.selectNodeContents(text);
        const label = range.getBoundingClientRect();
        return icon.top < label.bottom && icon.bottom > label.top;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width >= 1920) {
        const layout = await page.locator(".moderator-shell").evaluate(element => {
          const sidebar = element.querySelector("aside").getBoundingClientRect();
          const main = element.querySelector("main").getBoundingClientRect();
          return { sidebarWidth: sidebar.width, mainWidth: main.width, right: main.right };
        });
        expect(layout.mainWidth).toBeGreaterThanOrEqual(width - layout.sidebarWidth - 2);
        expect(layout.right).toBeLessThanOrEqual(width);
        if (width >= 2560) {
          await expect(page.locator(".moderator-document-grid")).toHaveCSS("gap", "24px");
          const cardWidth = await page.getByRole("article").evaluate(element => element.getBoundingClientRect().width);
          expect(cardWidth).toBeGreaterThanOrEqual(width >= 3840 ? 440 : 400);
        }
      }
      expect(await page.locator(".document-actions button").evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth + 1))).toBe(true);
      const edit = page.locator(".document-actions .moderator-icon-action").first();
      await expect(edit).toHaveAttribute("title", /\S/);
      if (width > 900) {
        await expect(edit).toHaveCSS("width", "44px");
        const columns = await page.locator(".moderator-document-grid").evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
        expect(columns).toBeGreaterThan(1);
        await expect(page.getByRole("article")).toHaveCount(1);
      } else {
        await expect(edit.locator("span")).toHaveCSS("position", "static");
      }
      await navigation.locator('a[href="#moderator-permissions"]').click();
      await expect(page).toHaveURL(/#moderator-permissions$/);
      await expect(navigation.locator('a[aria-current="location"]')).toHaveAttribute("href", "#moderator-permissions");
      await expect(page.locator(".moderator-permissions strong")).toHaveText("Documents");
      await expect(page.locator(".moderator-document-view")).toBeHidden();
      await expect(page.locator("#moderator-import")).toBeHidden();
      await page.locator(".moderator-permissions > summary").click();
      if (width <= 900) await toggle.click();
      await navigation.locator('a[href="#moderator-import"]').click();
      await expect(page).toHaveURL(/#moderator-import$/);
      await expect(page.locator("#moderator-import")).toBeVisible();
      await expect(page.locator(".moderator-permissions")).toBeHidden();
      if (width <= 900) await toggle.click();
      await navigation.locator('a[href="#moderator-documents"]').click();
      await expect(page).toHaveURL(/#moderator-documents$/);
      await expect(page.locator(".moderator-document-view")).toBeVisible();
      await expect(page.locator("#moderator-import")).toBeHidden();
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
    await expect(page.getByRole("article")).toContainText("Travel");
    await expect(page.getByRole("article")).toContainText("v2");
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
    for (const section of ["permissions", "documents"]) {
      if (width <= 900) await page.locator(".navigation-toggle").click();
      await page.locator(`#moderator-navigation a[href="#moderator-${section}"]`).click();
      if (section === "documents") await expect(page.locator(".moderator-document-view")).toBeVisible();
      else await expect(page.locator(".moderator-document-view")).toBeHidden();
    }
    await expect(page.getByLabel("Change summary")).toHaveValue("Updated policy");
    expect(await file.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("policy.pdf");
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
    await expect(page.getByRole("article")).toContainText("Draft");
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
    const destination = new URL("/admin", page.url()).href;
    await page.route(destination, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Administration</h1>" }));
    await page.getByRole("button", { name: "Sign in to administration", exact: true }).click();
    await expect(page).toHaveURL(destination);
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
    const destination = new URL(expected, page.url()).href;
    await page.route(destination, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Destination</h1>" }));
    await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole("heading", { name: "Destination" })).toBeVisible();
  });
}
