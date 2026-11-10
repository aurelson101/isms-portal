import { expect, test } from "./test";
import type { Page } from "@playwright/test";

const space = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "general",
  nameFr: "General",
  nameEn: "General",
  categories: [],
  permissions: {
    read: true,
    preview: true,
    search: true,
    upload: true,
    edit: true,
    publish: true,
    archive: true,
  },
};
const url =
  "https://training.sharepoint.com/:v:/r/sites/Academy/Shared%20Documents/Training.mp4?d=w12345678123441238123123456789abc";
const sensitiveDocument = {
  id: "sensitive-document",
  slug: "sensitive-document",
  sensitive: true,
  status: "PUBLISHED",
  translations: [{ locale: "en", title: "Private training" }],
  space,
  versions: [],
  externalUrl: url,
};

async function mockApi(page: Page, role: "reader" | "moderator" | "admin") {
  const created: Record<string, unknown>[] = [];
  const shared: Record<string, unknown>[] = [];
  let active = false;
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  await page.route("https://training.sharepoint.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Microsoft player</p>",
    }),
  );
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname === "/api/me" || pathname === "/api/admin/check")
      return route.fulfill({
        json: {
          username: "editor@example.test",
          displayName: "Editor",
          locale: "en",
          isAdmin: role === "admin",
          isModerator: role === "moderator",
          spaces: [space],
          authentication: { source: "local", diagnostics: {} },
        },
      });
    if (pathname === "/api/admin/spaces")
      return route.fulfill({ json: [space] });
    if (pathname === "/api/sensitive/me")
      return route.fulfill({ json: { depositor: true, canMark: true } });
    if (
      (pathname === "/api/documents/external" ||
        pathname === "/api/admin/documents/external") &&
      request.method() === "POST"
    ) {
      created.push(request.postDataJSON());
      return route.fulfill({ json: { id: "new", status: "DRAFT" } });
    }
    if (pathname === "/api/documents" || pathname === "/api/admin/documents")
      return route.fulfill({
        json: {
          items:
            searchParams.get("sensitive") === "true" ? [sensitiveDocument] : [],
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
    if (pathname === "/api/sensitive/documents/sensitive-document/shares") {
      if (request.method() === "POST") {
        shared.push(request.postDataJSON());
        active = true;
        return route.fulfill({ json: { emailSent: true } });
      }
      return route.fulfill({
        json: active
          ? [
              {
                id: "share",
                recipient: "recipient@example.test",
                createdBy: "editor@example.test",
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                state: "active",
              },
            ]
          : [],
      });
    }
    if (
      pathname === "/api/sensitive/shares/share" &&
      request.method() === "DELETE"
    ) {
      active = false;
      return route.fulfill({ json: { revoked: true } });
    }
    if (pathname === "/api/admin/dashboard")
      return route.fulfill({ json: null });
    if (pathname === "/api/health/details")
      return route.fulfill({ json: { services: {} } });
    if (pathname === "/api/admin/audit")
      return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: pathname === "/api/branding" ? {} : [] });
  });
  return { created, shared };
}

for (const role of ["reader", "moderator", "admin"] as const) {
  for (const width of [390, 1440]) {
    test(`${role} can create a sensitive SharePoint link at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const state = await mockApi(page, role);
      await page.goto(
        role === "admin"
          ? "/admin#documents"
          : role === "moderator"
            ? "/moderator#moderator-import"
            : "/explorer?space=general",
      );
      if (role === "reader")
        await page.getByRole("button", { name: "Upload", exact: true }).click();
      const source = page.getByRole("radio", {
        name: "Link / SharePoint video",
        exact: true,
      });
      const form = page.locator("form").filter({ has: source }).first();
      await source.check();
      if (role !== "reader")
        await form
          .getByRole("combobox", { name: "Space", exact: true })
          .selectOption(space.id);
      await form
        .getByRole("textbox", { name: "Title", exact: true })
        .fill("Training link");
      await form
        .getByRole("textbox", {
          name: "SharePoint or website link",
          exact: true,
        })
        .fill(url);
      await expect(form.locator(".sharepoint-video-player")).toHaveCount(1);
      await expect(
        form.getByRole("link", { name: "Open in SharePoint" }),
      ).toHaveAttribute("href", url);
      await form
        .getByRole("checkbox", {
          name:
            role === "admin"
              ? "Sensitive document"
              : "Sensitive link (named sharing in ISMS)",
          exact: true,
        })
        .check();
      await form
        .getByRole("checkbox", {
          name: "Do not send email notifications for this upload or publication",
          exact: true,
        })
        .check();
      await form
        .getByRole("button", { name: /Create|Upload/ })
        .last()
        .click();
      await expect.poll(() => state.created.length).toBe(1);
      expect(state.created[0]).toMatchObject({
        spaceId: space.id,
        url,
        title: "Training link",
        sensitive: true,
        suppressEmailNotifications: true,
      });
    });
  }
}

for (const role of ["admin", "moderator"] as const) {
  test(`${role} can select a sensitive document, share it by name and revoke access`, async ({
    page,
  }) => {
    const state = await mockApi(page, role);
    await page.goto(
      role === "admin" ? "/admin#sensitive" : "/moderator#moderator-sensitive",
    );
    const manager = page.locator(".sensitive-document-manager");
    await manager
      .getByRole("combobox", { name: "Document", exact: true })
      .selectOption("sensitive-document");
    await manager
      .locator("summary")
      .filter({ hasText: "Share this sensitive document" })
      .click();
    await manager
      .locator('input[name="recipient"]')
      .fill("recipient@example.test");
    await manager.getByRole("button", { name: "Share", exact: true }).click();
    await expect.poll(() => state.shared.length).toBe(1);
    expect(state.shared[0]).toEqual({
      recipient: "recipient@example.test",
      duration: "7d",
    });
    await expect(manager.getByRole("status")).toContainText(
      "Shared; email sent.",
    );
    await manager.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(
      manager.getByRole("button", { name: "Revoke", exact: true }),
    ).toHaveCount(0);
  });
}
