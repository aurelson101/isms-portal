import { expect, test } from "./test";
import { installManagementDemo } from "./management-demo";

for (const role of ["admin", "moderator"] as const)
  for (const width of [390, 1440]) {
    test(`${role} list and windows keep 20 documents and previous/next at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      const { requests } = await installManagementDemo(page, role);
      await page.goto(
        role === "admin" ? "/admin#metadata" : "/moderator#moderator-metadata",
      );
      const rows =
        role === "admin"
          ? page.locator(".management-documents tbody tr[role=row]")
          : page.locator(".moderator-document-card");
      await expect(rows).toHaveCount(20);
      const toggle = page.getByRole("group", {
        name: "Document view",
        exact: true,
      });
      await expect(
        toggle.getByRole("button", { name: "List", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await toggle
        .getByRole("button", { name: "Windows", exact: true })
        .click();
      await expect(rows).toHaveCount(20);
      await expect(
        toggle.getByRole("button", { name: "Windows", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page
        .locator(".document-pagination")
        .getByRole("button", { name: /Next/ })
        .click();
      await expect(rows).toHaveCount(20);
      await expect.poll(() => requests.at(-1)?.get("page")).toBe("2");
      await page
        .locator(".document-pagination")
        .getByRole("button", { name: /Next/ })
        .click();
      await expect(rows).toHaveCount(1);
      await expect(
        page
          .locator(".document-pagination")
          .getByRole("button", { name: /Next/ }),
      ).toBeDisabled();
      await page
        .locator(".document-pagination")
        .getByRole("button", { name: /Previous/ })
        .click();
      await expect(rows).toHaveCount(20);
      await page.reload();
      await expect(rows).toHaveCount(20);
      await expect(
        toggle.getByRole("button", { name: "Windows", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await toggle.getByRole("button", { name: "List", exact: true }).click();
      await expect(rows).toHaveCount(20);
      expect(requests.every((query) => query.get("limit") === "20")).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    });
  }
