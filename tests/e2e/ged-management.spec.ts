import { expect, test } from "./test";

test("portal restores combined GED criteria and saves them without losing favorites", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const queries: URLSearchParams[] = [];
  let saved: Record<string, string> | undefined;
  await page.route("**/api/**", (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          username: "reader@example.test",
          isAdmin: false,
          isModerator: false,
          locale: "en",
          spaces: [
            {
              id: "space",
              slug: "general",
              nameFr: "Documents",
              nameEn: "Documents",
              categories: [],
              permissions: { read: true, search: true },
            },
          ],
          authentication: {},
        },
      });
    if (path === "/api/documents") {
      queries.push(url.searchParams);
      return route.fulfill({
        json: { items: [], page: 1, total: 0, totalPages: 1 },
      });
    }
    if (
      path === "/api/user-tools/saved-searches" &&
      request.method() === "POST"
    ) {
      saved = request.postDataJSON().filters;
      return route.fulfill({ json: { id: "search" } });
    }
    return route.fulfill({ json: path === "/api/branding" ? {} : [] });
  });
  await page.goto(
    "/explorer?space=general&q=policy&favorites=true&owner=Alice&reviewTo=2026-12-31",
  );
  await expect
    .poll(() =>
      queries.some(
        (query) =>
          query.get("owner") === "Alice" &&
          query.get("space") === "general" &&
          query.get("q") === "policy" &&
          query.get("favorites") === "true" &&
          query.get("reviewTo") === "2026-12-31",
      ),
    )
    .toBe(true);
  page.once("dialog", (dialog) => dialog.accept("Owned policies"));
  await page.getByRole("button", { name: "Save search", exact: true }).click();
  await expect.poll(() => saved?.owner).toBe("Alice");
  expect(saved).toMatchObject({
    space: "general",
    q: "policy",
    favorites: "true",
    reviewTo: "2026-12-31",
  });
});

for (const scope of ["admin", "moderator"] as const)
  for (const width of [320, 1440]) {
    test(`${scope} GED search, batch preview and change history at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
      const space = {
        id: "space",
        slug: "documents",
        nameFr: "Documents",
        nameEn: "Documents",
        categories: [],
        permissions: { edit: true, publish: true, archive: true },
      };
      const documents = ["A", "B"].map((suffix, index) => ({
        id: `document-${suffix}`,
        updatedAt: `2026-10-31T10:00:0${index}.000Z`,
        space,
        category: null,
        status: "DRAFT",
        metadata: { "ged.owner": "Alice", retained: "keep" },
        permissions: { edit: true, publish: true, archive: true },
        translations: [
          { locale: "en", title: `Policy ${suffix}`, description: "" },
        ],
        versions: [{ id: `version-${suffix}`, locale: "en", version: 1 }],
      }));
      const batches: Array<{
        documents: Array<{ id: string; expectedUpdatedAt?: string }>;
        metadata: Record<string, string>;
      }> = [];
      const queries: string[] = [];
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          path = url.pathname;
        if (path === "/api/admin/check" || path === "/api/me")
          return route.fulfill({
            json: {
              isAdmin: scope === "admin",
              isModerator: scope === "moderator",
              username: "editor@example.test",
              displayName: "Editor",
              locale: "en",
              spaces: [space],
              authentication: {},
            },
          });
        if (path === "/api/admin/spaces")
          return route.fulfill({ json: [space] });
        if (path.endsWith("/categories")) return route.fulfill({ json: [] });
        if (path === "/api/documents/bulk/preview") {
          const body = request.postDataJSON();
          batches.push(body);
          return route.fulfill({
            json: body.documents.map((item: { id: string }) => {
              const document = documents.find(
                (document) => document.id === item.id,
              )!;
              return {
                id: document.id,
                title: document.translations[0].title,
                expectedUpdatedAt: document.updatedAt,
                categoryBefore: null,
                categoryAfter: null,
                metadataBefore: document.metadata,
                metadataAfter: { ...document.metadata, ...body.metadata },
                fields: Object.keys(body.metadata),
              };
            }),
          });
        }
        if (path === "/api/documents/bulk/apply") {
          const body = request.postDataJSON();
          batches.push(body);
          for (const document of documents)
            if (
              body.documents.some(
                (item: { id: string }) => item.id === document.id,
              )
            ) {
              document.metadata = { ...document.metadata, ...body.metadata };
              document.updatedAt = "2026-10-31T11:00:00.000Z";
            }
          return route.fulfill({ json: { updated: body.documents.length } });
        }
        if (path.endsWith("/history"))
          return route.fulfill({
            json: {
              page: 1,
              total: 1,
              items: [
                {
                  id: "audit",
                  at: "2026-10-31T11:00:00.000Z",
                  actor: "editor@example.test",
                  action: "document.metadata.bulk",
                  fields: ["ged.owner"],
                },
              ],
            },
          });
        if (path === "/api/documents/quality/summary")
          return route.fulfill({
            json: {
              total: 2,
              missingOwner: 0,
              incomplete: 2,
              overdueReviews: 0,
            },
          });
        if (path === "/api/admin/documents" || path === "/api/documents") {
          queries.push(url.searchParams.get("owner") || "");
          return route.fulfill({
            json: { items: documents, total: 2, page: 1, totalPages: 1 },
          });
        }
        if (path === "/api/admin/audit")
          return route.fulfill({ json: { items: [] } });
        if (path === "/api/admin/dashboard")
          return route.fulfill({ json: null });
        if (path === "/api/health/details")
          return route.fulfill({ json: { services: {} } });
        return route.fulfill({ json: path === "/api/branding" ? {} : [] });
      });
      await page.goto(
        scope === "admin" ? "/admin#metadata" : "/moderator#moderator-metadata",
      );
      await page.getByText("GED search", { exact: true }).click();
      const search = page
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: /^GED search$/ }) });
      await search
        .getByRole("searchbox", { name: "Owner", exact: true })
        .fill("Alice");
      await search.getByRole("button", { name: "Apply", exact: true }).click();
      await expect.poll(() => queries.includes("Alice")).toBe(true);
      await expect(page).toHaveURL(/owner=Alice/);
      await page.getByText("Bulk metadata editing", { exact: true }).click();
      const bulk = page.locator("details").filter({
        has: page.locator("summary", { hasText: /^Bulk metadata editing$/ }),
      });
      await bulk
        .getByRole("checkbox", { name: "Policy A", exact: true })
        .check();
      await bulk
        .getByRole("checkbox", { name: "Policy B", exact: true })
        .check();
      await bulk
        .getByRole("combobox", { name: "Field name", exact: true })
        .fill("ged.owner");
      await bulk
        .getByRole("textbox", { name: "Field value", exact: true })
        .fill("Bob");
      await bulk.getByRole("button", { name: "Add", exact: true }).click();
      await bulk
        .getByRole("button", { name: "Preview changes", exact: true })
        .click();
      await expect(bulk.locator(".document-bulk-preview article")).toHaveCount(
        2,
      );
      expect(documents[0].metadata["ged.owner"]).toBe("Alice");
      await bulk
        .getByRole("button", { name: "Confirm batch", exact: true })
        .click();
      await expect.poll(() => batches.length).toBe(2);
      expect(
        batches[1].documents.every((document) => !!document.expectedUpdatedAt),
      ).toBe(true);
      expect(
        documents.every(
          (document) =>
            document.metadata["ged.owner"] === "Bob" &&
            document.metadata.retained === "keep" &&
            document.versions.length === 1,
        ),
      ).toBe(true);
      await page.locator(".document-actions button").first().click();
      await page.getByText("Change history", { exact: true }).click();
      await expect(
        page.getByText("document.metadata.bulk", { exact: false }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    });
  }
