import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./test";
import { installManagementDemo } from "./management-demo";

test("capture current anonymized README interfaces", async ({ page }) => {
  test.skip(
    process.env.ISMS_README_SCREENSHOTS !== "1",
    "Explicit screenshot generation only",
  );
  const directory = path.resolve("docs/screenshots");
  await mkdir(directory, { recursive: true });
  const forbiddenText = (process.env.ISMS_SCREENSHOT_FORBIDDEN_TEXT || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const checkAnonymization = async () => {
    const body = (await page.locator("body").innerText()).toLowerCase();
    for (const value of forbiddenText) expect(body).not.toContain(value);
  };
  const capture = async (name: string) => {
    await checkAnonymization();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(directory, name),
      animations: "disabled",
      fullPage: false,
      style: "nextjs-portal { display: none !important; }",
    });
  };
  await installManagementDemo(page, "admin");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "General documents", exact: true }),
  ).toBeVisible();
  await capture("portal-desktop.png");
  await page.goto("/explorer");
  await expect(
    page.getByRole("button", { name: "Open", exact: true }).first(),
  ).toBeVisible();
  await capture("explorer-desktop.png");
  await page.locator(".account-button").click();
  await page.getByRole("button", { name: "My workspace", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "My workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Information security policy", exact: true }),
  ).toBeVisible();
  await capture("workspace-desktop.png");
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "General documents", exact: true }),
  ).toBeVisible();
  await capture("portal-mobile.png");
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/admin#metadata");
  await expect(
    page.locator(".management-documents tbody tr[role=row]"),
  ).toHaveCount(20);
  const toggle = page.getByRole("group", {
    name: "Document view",
    exact: true,
  });
  await toggle.getByRole("button", { name: "List", exact: true }).click();
  await capture("admin-metadata-list.png");
  await toggle.getByRole("button", { name: "Windows", exact: true }).click();
  await capture("admin-metadata-windows.png");
  await page.locator(".document-actions button").first().click();
  await expect(page.locator("#document-metadata-form")).toBeVisible();
  await page.locator("#document-metadata-form").screenshot({
    path: path.join(directory, "metadata-editor.png"),
    animations: "disabled",
    style: "nextjs-portal { display: none !important; }",
  });
  await page.goto("/moderator#moderator-documents");
  await expect(page.locator(".moderator-document-card")).toHaveCount(20);
  await toggle.getByRole("button", { name: "List", exact: true }).click();
  await capture("moderator-documents-list.png");
  await toggle.getByRole("button", { name: "Windows", exact: true }).click();
  await capture("moderator-documents-windows.png");
  await checkAnonymization();
});
