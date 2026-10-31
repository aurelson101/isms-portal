import { expect, test } from "./test";

for (const scope of ["admin", "moderator"] as const)
  for (const width of [320, 1440]) {
    test(`${scope} metadata menu saves and restores fields at ${width}px`, async ({
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
      const document = {
        id: "document",
        space,
        category: null,
        status: "DRAFT",
        metadata: { Reference: "POL-001" },
        permissions: { edit: true, publish: true, archive: true },
        translations: [{ locale: "en", title: "Policy", description: "" }],
        versions: [{ id: "version", locale: "en", version: 1 }],
      };
      const saved: Record<string, unknown>[] = [];
      await page.route("**/api/**", async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
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
        if (path === "/api/documents/document/categories")
          return route.fulfill({ json: [] });
        if (path === "/api/documents/document/metadata") {
          const body = request.postDataJSON();
          saved.push(body);
          document.metadata = body.metadata;
          return route.fulfill({ json: document.translations[0] });
        }
        if (path === "/api/admin/documents" || path === "/api/documents")
          return route.fulfill({
            json: { items: [document], total: 1, page: 1, totalPages: 1 },
          });
        if (path === "/api/admin/audit")
          return route.fulfill({ json: { items: [] } });
        if (path === "/api/admin/dashboard")
          return route.fulfill({ json: null });
        if (path === "/api/health/details")
          return route.fulfill({ json: { services: {} } });
        return route.fulfill({ json: path === "/api/branding" ? {} : [] });
      });
      await page.goto(scope === "admin" ? "/admin#documents" : "/moderator");
      if (width === 320) await page.locator("aside .navigation-toggle").click();
      await page
        .locator("aside")
        .getByRole(scope === "admin" ? "button" : "link", {
          name: "GED metadata",
          exact: true,
        })
        .click();
      const heading = page.getByRole("heading", {
        name: "GED metadata",
        exact: true,
      });
      await expect(heading).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New version", exact: true }),
      ).toHaveCount(0);
      const edit = page.locator(".document-actions button").first();
      await edit.click();
      const form = page.locator(
        scope === "admin"
          ? "#document-metadata-form"
          : "#moderator-metadata-form",
      );
      await form
        .getByRole("textbox", { name: "Reference", exact: true })
        .fill("POL-002");
      await form.getByRole("button", { name: "Save", exact: true }).click();
      await expect(form).toHaveCount(0);
      expect(saved[0].metadata).toEqual({ Reference: "POL-002" });
      expect(document.versions).toHaveLength(1);
      await page.reload();
      await expect(heading).toBeVisible();
      await edit.click();
      await expect(
        form.getByRole("textbox", { name: "Reference", exact: true }),
      ).toHaveValue("POL-002");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      if (scope === "moderator") {
        document.permissions.edit = false;
        await page.reload();
        await expect(heading).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Edit", exact: true }),
        ).toHaveCount(0);
      }
    });
  }
