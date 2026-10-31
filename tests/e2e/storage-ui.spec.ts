import { expect, test, type Page } from "@playwright/test";

const permissions = {
  showMenu: true,
  read: true,
  preview: true,
  search: true,
  upload: true,
  edit: true,
  publish: true,
  archive: true,
  download: true,
};
const space = {
  id: "space",
  slug: "general",
  nameFr: "Documents généraux",
  nameEn: "General documents",
  categories: [],
  permissions,
};
const document = {
  id: "doc",
  slug: "long-title",
  status: "PUBLISHED",
  sensitive: false,
  watermarkPosition: "CENTER",
  publishedAt: "2026-09-21T10:00:00Z",
  updatedAt: "2026-09-21T10:00:00Z",
  viewCount: 1,
  downloadCount: 1,
  favorite: false,
  space,
  category: null,
  reviews: [],
  permissions,
  translations: [
    {
      locale: "fr",
      title: "Procedure_Impression_Securisee_Chessy_et_documents_utilisateurs",
      description: "Document de test",
    },
    {
      locale: "en",
      title: "Secure_printing_procedure_and_employee_documentation",
      description: "Test document",
    },
  ],
  versions: [
    {
      id: "v1",
      version: 1,
      locale: "fr",
      createdAt: "2026-09-21T10:00:00Z",
      storedFile: {
        mimeType: "application/pdf",
        originalName: "test.pdf",
        size: 10,
      },
    },
  ],
};

async function mockApi(page: Page, locale: "en" | "fr") {
  const targets: Array<Record<string, unknown>> = [];
  await page.addInitScript((value) => {
    localStorage.setItem("isms-locale", value);
    localStorage.setItem("isms-document-view", "list");
  }, locale);
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown = [];
    if (url.pathname === "/api/admin/check" || url.pathname === "/api/me")
      json = {
        isAdmin: true,
        username: "test@example.test",
        displayName: "Test user",
        primaryAdmin: true,
        locale,
        spaces: [space],
        authentication: {
          source: "local",
          ssoConnected: false,
          sessionExpiresAt: null,
          diagnostics: {
            groupCount: 1,
            mappedSpaceCount: 1,
            administrator: true,
            administratorAccount: true,
          },
        },
      };
    else if (url.pathname === "/api/branding") json = {};
    else if (url.pathname === "/api/admin/dashboard") json = null;
    else if (url.pathname === "/api/admin/audit") json = { items: [] };
    else if (url.pathname === "/api/health/details") json = { services: {} };
    else if (url.pathname === "/api/admin/spaces") json = [space];
    else if (url.pathname === "/api/documents")
      json = { items: [document], page: 1, total: 1, totalPages: 1 };
    else if (
      url.pathname === "/api/storage-options" ||
      url.pathname.endsWith("/storage-targets/options")
    )
      json = [{ id: "s3", name: "Shared documents", type: "s3" }];
    else if (url.pathname === "/api/admin/storage-targets") {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        targets.push({
          ...body,
          id: "target1",
          enabled: false,
          testStatus: "untested",
          testedAt: null,
        });
        json = targets[0];
      } else json = targets;
    } else if (url.pathname.endsWith("/storage-targets/target1/test")) {
      Object.assign(targets[0], {
        testStatus: "success",
        testedAt: "2026-09-21T10:00:00Z",
      });
      json = { success: true };
    } else if (
      url.pathname.endsWith("/storage-targets/target1") &&
      request.method() === "PUT"
    ) {
      Object.assign(targets[0], request.postDataJSON());
      json = targets[0];
    }
    await route.fulfill({ json });
  });
}

for (const width of [390, 768, 1600]) {
  test(`storage configuration and document layout at ${width}px`, async ({
    page,
  }, info) => {
    const locale = width === 768 ? "fr" : "en";
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mockApi(page, locale);
    await page.goto("/admin#storage");
    await page
      .getByRole("button", {
        name: locale === "fr" ? "Ajouter un stockage" : "Add storage",
      })
      .click();
    const form = page.locator(".storage-editor form");
    await form.locator('[name="name"]').fill("Shared document storage");
    await form.locator('[name="endpoint"]').fill("https://s3.example.test");
    await form.locator('[name="bucket"]').fill("isms");
    await form.locator('[name="accessKeyId"]').fill("example");
    await form.locator('[name="secretAccessKey"]').fill("example-secret");
    await form
      .getByRole("button", {
        name: locale === "fr" ? "Enregistrer" : "Save",
        exact: true,
      })
      .click();
    await expect(
      page.locator(".storage-row input[type=checkbox]"),
    ).toBeDisabled();
    await page
      .getByRole("button", {
        name: locale === "fr" ? "Tester la connexion" : "Test connection",
      })
      .click();
    await page.locator(".storage-row input[type=checkbox]").click();
    await expect(
      page.locator(".storage-row input[type=checkbox]"),
    ).toBeChecked();
    await expect(form.locator('[name="secretAccessKey"]')).toHaveValue("");
    await expect(page.locator(".storage-panel")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`storage-${width}.png`),
      fullPage: true,
    });
    await page.goto("/explorer?space=general");
    await expect(page.locator(".document-list .document-title")).toBeVisible();
    const breadcrumb = page.locator(".document-breadcrumb");
    expect((await breadcrumb.boundingBox())!.height).toBeLessThan(65);
    expect(
      await breadcrumb
        .locator("button")
        .first()
        .evaluate((button) => getComputedStyle(button).color),
    ).not.toBe("rgb(255, 255, 255)");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    const title = await page
      .locator(".document-list .document-title")
      .boundingBox();
    const actions = await page
      .locator(".document-list .document-row-actions")
      .boundingBox();
    expect(
      title!.x + title!.width <= actions!.x + 1 ||
        title!.y + title!.height <= actions!.y,
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`documents-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: locale === "fr" ? "Déposer" : "Upload",
        exact: true,
      })
      .click();
    const storage = page.locator('select[name="storageTargetId"]');
    await expect(storage).toHaveValue("primary");
    await expect(storage.locator('option[value="s3"]')).toHaveCount(1);
    await storage.selectOption("s3");
    await expect(storage).toHaveValue("s3");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`upload-${width}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
