import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve("apps/web/app/styles.css"), "utf8");

for (const width of [320, 768, 1280]) {
  test(`shared admin and moderator button styles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`<style>${styles}</style>
      <div class="admin-shell"><main>
        <button id="admin-action">Test integration</button>
        <button id="disabled" disabled>Unavailable</button>
        <button id="primary" class="primary">Save</button>
      </main></div>
      <main class="admin-main moderator-workspace">
        <form class="moderator-search"><label>Search documents<input type="search"></label>
          <button id="search">Search</button><button id="reset">Reset</button></form>
        <div class="moderator-toolbar"><button id="refresh">Refresh</button></div>
        <div class="matrix-heading" style="max-width: 121px"><button id="add-rule">Add a rule</button></div>
        <div class="space-category-row"><div class="button-row" style="max-width: 100px"><button id="add-category">Add subcategory</button></div></div>
      </main>`);
    for (const id of ["admin-action", "search", "reset", "refresh"]) {
      const button = page.locator(`#${id}`);
      await expect(button).toBeVisible();
      const style = await button.evaluate((element) => {
        const css = getComputedStyle(element);
        return { border: css.borderTopWidth, radius: css.borderTopLeftRadius, height: element.clientHeight, padding: css.paddingLeft };
      });
      expect(style.border).toBe("1px");
      expect(style.radius).toBe("7px");
      expect(style.height).toBeGreaterThanOrEqual(42);
      expect(style.padding).toBe("12px");
    }
    expect(await page.locator("#disabled").evaluate((element) => getComputedStyle(element).cursor)).toBe("not-allowed");
    expect(await page.locator("#primary").evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgb(255, 255, 255)");
    expect(await page.locator('input').evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("1px");
    for (const id of ["add-rule", "add-category"]) {
      await expect(page.locator(`#${id}`)).toHaveCSS("white-space", "normal");
      expect(await page.locator(`#${id}`).evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    }
    await page.locator("#search").focus();
    expect(await page.locator("#search").evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
