import { expect, test } from "./test";

test("a delayed list response cannot restore a removed favorite", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const space = {
    id: "space",
    slug: "general",
    nameFr: "Documents",
    nameEn: "Documents",
    categories: [],
    permissions: { read: true, search: true },
  };
  const document = {
    id: "policy",
    slug: "favorite-policy",
    status: "PUBLISHED",
    space,
    category: null,
    reviews: [],
    metadata: {},
    viewCount: 0,
    downloadCount: 0,
    translations: [{ locale: "en", title: "Favorite policy" }],
    versions: [
      {
        id: "v1",
        version: 1,
        locale: "en",
        storedFile: { mimeType: "application/pdf" },
      },
    ],
    permissions: { read: true, preview: false, download: false },
    favorite: true,
  };
  let favorite = true;
  let delayNext = false;
  let staleStarted = false;
  let refreshed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me")
      return route.fulfill({
        json: {
          username: "reader@example.test",
          displayName: "Reader",
          isAdmin: false,
          isModerator: false,
          locale: "en",
          spaces: [space],
          authentication: {},
        },
      });
    if (url.pathname === "/api/documents/policy/favorite") {
      expect(route.request().method()).toBe("DELETE");
      favorite = false;
      return route.fulfill({ json: { favorite } });
    }
    if (url.pathname === "/api/documents") {
      const delayed = delayNext;
      delayNext = false;
      const items = favorite ? [{ ...document }] : [];
      if (!favorite) refreshed = true;
      if (delayed) {
        staleStarted = true;
        await gate;
      }
      return route.fulfill({
        json: { items, total: items.length, page: 1, totalPages: 1 },
        headers: delayed ? { "x-regression-snapshot": "stale" } : {},
      });
    }
    return route.fulfill({ json: url.pathname === "/api/branding" ? {} : [] });
  });
  try {
    await page.goto("/explorer?favorites=true");
    const row = page
      .locator(".document")
      .filter({ hasText: "Favorite policy" });
    await expect(row).toBeVisible();
    delayNext = true;
    await page
      .getByRole("combobox", { name: "Sort by", exact: true })
      .selectOption("popular");
    await expect.poll(() => staleStarted).toBe(true);
    await row
      .getByRole("button", { name: "Remove from favorites", exact: true })
      .click();
    await expect.poll(() => refreshed).toBe(true);
    await expect(row).toHaveCount(0);
    const delayed = page.waitForResponse(
      (response) => response.headers()["x-regression-snapshot"] === "stale",
    );
    release();
    await (await delayed).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(row).toHaveCount(0);
  } finally {
    release();
  }
});
