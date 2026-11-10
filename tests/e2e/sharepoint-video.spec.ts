import { expect, test } from "./test";

for (const [width, preview, locale, plainLink = false, file = false] of [
  [390, true, "en"],
  [1440, true, "en"],
  [1440, true, "fr"],
  [2560, true, "en"],
  [844, true, "en"],
  [390, false, "en"],
  [390, true, "en", true],
  [1440, true, "en", false, true],
] as const) {
  test(`SharePoint player respects preview access at ${width}px (${preview}, ${locale}, ${plainLink}, ${file})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 1000 });
    await page.addInitScript(
      (language) => localStorage.setItem("isms-locale", language),
      locale,
    );
    const space = {
      id: "space",
      slug: "general",
      nameFr: "General",
      nameEn: "General",
      categories: [],
      permissions: { read: true, search: true },
    };
    const url = plainLink
      ? "https://example.test/guide"
      : "https://training.sharepoint.com/:v:/r/sites/Academy/Shared%20Documents/Training.mp4?d=w12345678123441238123123456789abc&web=1";
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
        { locale: "fr", title: "Vidéo de formation", description: "" },
      ],
      versions: file
        ? ["en", "fr"].map((language) => ({
            id: language,
            locale: language,
            version: 1,
            storedFile: { mimeType: "text/plain" },
          }))
        : [],
      externalUrl: preview && !file ? url : null,
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
            locale,
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
    const card = page.locator(".document").first();
    if (file) {
      await card
        .locator(".locales")
        .getByRole("button", { name: "FR", exact: true })
        .click();
      await expect(card.locator(".document-title")).toHaveText(
        "Vidéo de formation",
      );
      await card
        .locator(".locales")
        .getByRole("button", { name: "EN", exact: true })
        .click();
      await expect(card.locator(".document-title")).toHaveText(
        "Training video",
      );
      return;
    }
    await expect(card.locator(".locales button")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: locale === "fr" ? "Vidéo de formation" : "Training video",
        exact: true,
      })
      .click();
    const player = page.locator(".sharepoint-video-player");
    const external = page.getByRole("link", {
      name: locale === "fr" ? "Ouvrir dans SharePoint" : "Open in SharePoint",
    });
    if (!preview) {
      await expect(player).toHaveCount(0);
      await expect(external).toHaveCount(0);
      return;
    }
    if (plainLink) {
      await expect(player).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Open external link", exact: true }),
      ).toHaveAttribute("href", url);
      return;
    }
    await expect(player).toBeVisible();
    const languages = page.locator(".modal-locales");
    await expect(languages.getByText("EN", { exact: true })).toBeVisible();
    await expect(languages.getByText("FR", { exact: true })).toBeVisible();
    await expect(languages.getByRole("button")).toHaveCount(0);
    await expect(page.locator(".document-version-badge").first()).toHaveText(
      locale === "fr" ? "Lien" : "Link",
    );
    const information = page.locator(".document-reader-meta");
    await expect(information).toContainText(
      locale === "fr" ? "Gérée à la source" : "Managed at source",
    );
    await expect(page.locator(".document-modal h2")).toHaveText(
      locale === "fr" ? "Vidéo de formation" : "Training video",
    );
    await expect(external).toHaveCount(0);
    const modal = page.locator(".document-modal");
    expect(
      await modal.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true);
    const management = modal.locator(".document-ged-panel > summary");
    if (await management.count())
      await expect(management).toHaveCSS("writing-mode", "horizontal-tb");
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
