import { expect, test } from "./test";
import ExcelJS from "exceljs";

test("Excel filter choices follow the selected worksheet and reset safely", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const book = new ExcelJS.Workbook();
  for (const [name, values] of [
    ["First", ["Alpha", "Beta"]],
    ["Second", ["Gamma", "Delta"]],
  ] as const) {
    const sheet = book.addWorksheet(name);
    sheet.addRows([["Item"], ...values.map((value) => [value])]);
    sheet.autoFilter = "A1:A3";
  }
  const preview = Buffer.from(await book.xlsx.writeBuffer());
  const space = {
    id: "space",
    slug: "general",
    nameFr: "General",
    nameEn: "General",
    categories: [],
    permissions: { read: true, search: true },
  };
  const document = {
    id: "document",
    slug: "test-workbook",
    status: "PUBLISHED",
    space,
    category: null,
    reviews: [],
    metadata: {},
    translations: [{ locale: "en", title: "Workbook", description: "" }],
    versions: [
      {
        id: "version",
        locale: "en",
        version: 1,
        storedFile: {
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      },
    ],
    permissions: { preview: true, download: false },
    favorite: false,
  };
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
    if (path.includes("/preview") || path.endsWith("/content"))
      return route.fulfill({
        body: preview,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    return route.fulfill({ json: path === "/api/branding" ? {} : [] });
  });
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const reader = page.locator(".excel-reader");
  const filter = reader.locator("th select");
  await expect(filter.locator("option", { hasText: "Alpha" })).toHaveCount(1);
  await filter.selectOption({ label: "Alpha" });
  await expect(reader.locator("tbody tr")).toHaveCount(1);
  await reader.getByRole("tab", { name: "Second", exact: true }).click();
  await expect(filter.locator("option", { hasText: "Alpha" })).toHaveCount(0);
  await expect(filter.locator("option", { hasText: "Gamma" })).toHaveCount(1);
  await expect(filter).toHaveValue("");
  await reader.getByRole("tab", { name: "First", exact: true }).click();
  await expect(filter.locator("option", { hasText: "Alpha" })).toHaveCount(1);
  await expect(reader.locator("tbody tr")).toHaveCount(2);
});
