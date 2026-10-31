import { expect, test, type Page } from "@playwright/test";

async function mockLogin(page: Page) {
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/auth/config"
          ? { directoryLoginEnabled: true, ssoEnabled: false }
          : {},
    }),
  );
}

test("login remains usable with blocked browser storage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await mockLogin(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(errors).toEqual([]);
});

test("interface language follows same-tab and cross-tab changes", async ({
  page,
}) => {
  await mockLogin(page);
  await page.goto("/login");
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("isms-locale", { detail: "en" })),
  );
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "isms-locale", newValue: "fr" }),
    ),
  );
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("isms-locale", { detail: "invalid" })),
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("password visibility and caps lock feedback do not change form payload", async ({
  page,
}) => {
  await mockLogin(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("test-only-password");
  await page
    .getByRole("checkbox", { name: "Show password", exact: true })
    .check();
  await expect(password).toHaveAttribute("type", "text");
  await password.focus();
  await password.dispatchEvent("keydown", { key: "A", modifierCapsLock: true });
  await expect(page.getByRole("status")).toHaveText("Caps Lock is on");
  await page
    .getByRole("checkbox", { name: "Show password", exact: true })
    .uncheck();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(
    await page
      .locator("form")
      .evaluate((form: HTMLFormElement) =>
        Array.from(new FormData(form).keys()),
      ),
  ).toEqual(["login", "password"]);
});

test("admin tabs support keyboard selection and MFA receives focus", async ({
  page,
}) => {
  await mockLogin(page);
  await page.goto("/admin/login");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  const local = page.getByRole("tab", { name: "Local account" });
  const directory = page.getByRole("tab", { name: "Active Directory" });
  await local.focus();
  await page.keyboard.press("End");
  await expect(directory).toBeFocused();
  await expect(directory).toHaveAttribute("aria-selected", "true");
  await expect(local).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("Home");
  await expect(local).toBeFocused();
  await page.getByLabel("Administrator username").fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ status: 401, json: { message: "MFA required" } }),
  );
  await page.getByRole("button", { name: "Sign in to administration" }).click();
  await expect(page.getByLabel("MFA code")).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "admin-local-tab",
  );
});

test("moderator preserves dirty forms on cancellation and category load failure", async ({
  page,
}) => {
  const space = {
    id: "space",
    nameFr: "Documents",
    nameEn: "Documents",
    permissions: { edit: true, archive: true },
  };
  const document = {
    id: "document",
    status: "PUBLISHED",
    space,
    category: null,
    translations: [{ locale: "en", title: "Policy", description: "" }],
    versions: [{ id: "v1", locale: "en", version: 1 }],
  };
  let categoriesFail = true;
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me")
      return route.fulfill({
        json: { isModerator: true, locale: "en", spaces: [space] },
      });
    if (url.pathname.endsWith("/categories"))
      return route.fulfill({
        json: categoriesFail ? { unexpected: true } : [],
      });
    if (url.pathname === "/api/documents")
      return route.fulfill({
        json: { items: [document], page: 1, totalPages: 1 },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto("/moderator");
  await page.getByRole("button", { name: "New version", exact: true }).click();
  await page.getByLabel("Change summary").fill("Do not lose this change");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Change summary")).toHaveValue(
    "Do not lose this change",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(".error-state[role=alert]")).toHaveText(
    "Invalid category response",
  );
  await expect(page.getByLabel("Change summary")).toHaveValue(
    "Do not lose this change",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Change summary")).toBeVisible();
  categoriesFail = false;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("#moderator-metadata-form")).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.locator("#moderator-metadata-form")).toHaveCount(0);
});
