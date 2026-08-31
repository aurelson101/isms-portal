import { expect, test } from "./test";

test.beforeEach(async ({ page }) => {
  const response = await page.request.put("/api/me/preferences", {
    data: { locale: "fr" },
  });
  expect(response.ok()).toBe(true);
});

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`portal visual regression - ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("isms-locale", "fr");
      localStorage.setItem("isms-document-view", "list");
    });
    await page.goto("/");
    await page
      .locator("header")
      .getByRole("button", { name: "FR", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Bienvenue",
    );
    await expect(page).toHaveScreenshot(`portal-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });

  test(`document explorer visual regression - ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("isms-locale", "fr");
      localStorage.setItem("isms-document-view", "list");
    });
    await page.goto("/");
    await page
      .locator("header")
      .getByRole("button", { name: "FR", exact: true })
      .click();
    if (viewport.width <= 900) {
      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
    }
    await page.locator("aside .space-menu[aria-controls]").first().click();
    await page
      .locator("aside .category-submenu")
      .first()
      .getByRole("button", { name: "Procédures", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Explorateur documentaire",
        level: 1,
      }),
    ).toBeVisible();
    if (viewport.width <= 600) {
      await page.getByRole("button", { name: "Filtrer et trier" }).click();
    }
    await expect(page.getByLabel("Trier par")).toBeVisible();
    await expect(page).toHaveScreenshot(`explorer-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
}
