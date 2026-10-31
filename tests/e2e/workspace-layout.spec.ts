import { expect, test } from "./test";
import { installManagementDemo } from "./management-demo";

for (const width of [390, 768, 1440]) {
  test(`workspace header and navigation remain usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 });
    await installManagementDemo(page, "admin");
    await page.goto("/explorer");
    await page.locator(".account-button").click();
    await page
      .getByRole("button", { name: "My workspace", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "My workspace",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate((element) => {
      const heading = element.querySelector(".personal-tools-heading")!;
      const header = heading.getBoundingClientRect();
      const title = heading.querySelector("h2")!.getBoundingClientRect();
      const description = heading.querySelector("p")!.getBoundingClientRect();
      const buttons = element.querySelectorAll(".personal-tools-tabs button");
      const first = buttons[0].getBoundingClientRect();
      const second = buttons[1].getBoundingClientRect();
      return {
        headerTop: header.top,
        headerBottom: header.bottom,
        titleTop: title.top,
        descriptionBottom: description.bottom,
        firstX: first.x,
        secondX: second.x,
        firstY: first.y,
        secondY: second.y,
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(layout.titleTop).toBeGreaterThanOrEqual(layout.headerTop);
    expect(layout.descriptionBottom).toBeLessThanOrEqual(layout.headerBottom);
    expect(layout.overflow).toBe(false);
    if (width > 760) {
      expect(layout.firstX).toBeCloseTo(layout.secondX, 0);
      expect(layout.secondY).toBeGreaterThan(layout.firstY);
    } else {
      expect(layout.firstY).toBeCloseTo(layout.secondY, 0);
      expect(layout.secondX).toBeGreaterThan(layout.firstX);
    }
  });
}
