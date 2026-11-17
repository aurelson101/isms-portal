import { expect, test } from "./test";

test("two moderator sessions preserve the first save and recover from a stale edit", async ({
  browser,
}) => {
  const space = {
    id: "space",
    slug: "general",
    nameFr: "Documents",
    nameEn: "Documents",
    categories: [],
    permissions: { edit: true, publish: true, archive: true },
  };
  const document = {
    id: "document",
    space,
    category: null,
    status: "DRAFT",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metadata: { Reference: "POL-001" },
    permissions: { edit: true, publish: true, archive: true },
    translations: [{ locale: "en", title: "Policy", description: "" }],
    versions: [{ id: "version", locale: "en", version: 1 }],
  };
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  let saves = 0,
    conflicts = 0;
  try {
    const pages = await Promise.all(
      contexts.map(async (context, index) => {
        await context.addInitScript(() =>
          localStorage.setItem("isms-locale", "en"),
        );
        await context.route("**/api/**", async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          if (path === "/api/me")
            return route.fulfill({
              json: {
                isAdmin: false,
                isModerator: true,
                username: `moderator${index}@example.test`,
                locale: "en",
                spaces: [space],
                authentication: {},
              },
            });
          if (path === "/api/documents/document/categories")
            return route.fulfill({ json: [] });
          if (path === "/api/documents/document/metadata") {
            const body = request.postDataJSON();
            if (body.expectedUpdatedAt !== document.updatedAt) {
              conflicts++;
              return route.fulfill({
                status: 409,
                json: { message: "Document changed; reload before saving" },
              });
            }
            document.metadata = body.metadata;
            document.updatedAt = "2026-01-01T00:00:01.000Z";
            saves++;
            return route.fulfill({ json: document });
          }
          if (path === "/api/documents")
            return route.fulfill({
              json: { items: [document], page: 1, total: 1, totalPages: 1 },
            });
          return route.fulfill({ json: path === "/api/branding" ? {} : [] });
        });
        const page = await context.newPage();
        await page.goto("/moderator#metadata");
        await page.locator(".document-actions button").first().click();
        return page;
      }),
    );
    const forms = pages.map((page) => page.locator("#moderator-metadata-form"));
    await forms[0]
      .getByRole("textbox", { name: "Reference", exact: true })
      .fill("FIRST-SAVE");
    await forms[1]
      .getByRole("textbox", { name: "Reference", exact: true })
      .fill("STALE-SAVE");
    await forms[0].getByRole("button", { name: "Save", exact: true }).click();
    await expect(forms[0]).toHaveCount(0);
    await forms[1].getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => conflicts).toBe(1);
    await expect(
      forms[1].getByRole("textbox", { name: "Reference", exact: true }),
    ).toHaveValue("STALE-SAVE");
    expect(document.metadata.Reference).toBe("FIRST-SAVE");
    expect(saves).toBe(1);
    await pages[1].reload();
    await pages[1].locator(".document-actions button").first().click();
    await expect(
      forms[1].getByRole("textbox", { name: "Reference", exact: true }),
    ).toHaveValue("FIRST-SAVE");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
