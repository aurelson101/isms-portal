import { expect, test } from "./test";

for (const [width, preview] of [
  [390, true],
  [1440, true],
  [390, false],
] as const) {
  test(`SharePoint player respects preview access at ${width}px (${preview})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const space = {
      id: "space",
      slug: "general",
      nameFr: "General",
      nameEn: "General",
      categories: [],
      permissions: { read: true, search: true },
    };
    const url =
      "https://training.sharepoint.com/:v:/r/sites/Academy/Shared%20Documents/Training.mp4?d=w12345678123441238123123456789abc&web=1";
    const document = {
      id: "video",
      slug: "training-video",
      status: "PUBLISHED",
      space,
      category: null,
      reviews: [],
      viewCount: 0,
      downloadCount: 0,
      metadata: {},
      translations: [
        { locale: "en", title: "Training video", description: "" },
      ],
      versions: [],
      externalUrl: preview ? url : null,
      permissions: { read: true, preview, download: false },
      favorite: false,
    };
    await page.route("https://training.sharepoint.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Microsoft player</p>",
      }),
    );
    await page.route("**/api/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/me")
        return route.fulfill({
          json: {
            username: "reader@example.test",
            displayName: "Reader",
            locale: "en",
            isAdmin: false,
            isModerator: false,
            spaces: [space],
            authentication: { source: "local" },
          },
        });
      if (path === "/api/documents")
        return route.fulfill({
          json: { items: [document], page: 1, total: 1, totalPages: 1 },
        });
      if (
        path === "/api/documents/video" ||
        path === "/api/documents/by-slug/training-video"
      )
        return route.fulfill({ json: document });
      if (path === "/api/documents/video/ged")
        return route.fulfill({
          json: {
            features: {
              links: false,
              comments: false,
              signatures: false,
              sharing: false,
            },
            subscribed: false,
            canEdit: false,
            isAdmin: false,
            lock: null,
            versions: [],
            links: [],
            comments: [],
          },
        });
      return route.fulfill({ json: path === "/api/branding" ? {} : [] });
    });
    await page.goto("/explorer");
    await page
      .getByRole("button", { name: "Training video", exact: true })
      .click();
    const player = page.locator(".sharepoint-video-player");
    const external = page.getByRole("link", { name: "Open in SharePoint" });
    if (!preview) {
      await expect(player).toHaveCount(0);
      await expect(external).toHaveCount(0);
      return;
    }
    await expect(player).toBeVisible();
    await expect(external).toHaveAttribute("href", url);
    const bounds = await player.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(Math.abs(bounds!.width / bounds!.height - 16 / 9)).toBeLessThan(
      0.05,
    );
    await expect(player).toHaveAttribute(
      "src",
      "https://training.sharepoint.com/sites/Academy/_layouts/15/embed.aspx?UniqueId=12345678-1234-4123-8123-123456789abc",
    );
  });
}
