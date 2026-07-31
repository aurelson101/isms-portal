import { expect, test } from "@playwright/test";

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
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Bienvenue",
    );
    await expect(page).toHaveScreenshot(`portal-${viewport.name}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    });
  });
}
