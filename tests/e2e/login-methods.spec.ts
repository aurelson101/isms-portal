import type { Page } from "@playwright/test";
import { expect, test } from "./test";

const verifiedSso = {
  directoryLoginEnabled: true,
  ssoEnabled: true,
  ssoPilotUrl: "/oauth2/start?rd=/",
  ssoLoginUrl: null,
};
async function mockLogin(page: Page, config: object = verifiedSso) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: path === "/api/me" ? 401 : 200,
      json: path === "/api/auth/config" ? config : {},
    });
  });
}

for (const width of [320, 768, 1280]) {
  for (const [role, entry, destination] of [
    ["user", "/login?return=%2Fexplorer", "/explorer"],
    ["moderator", "/moderator", "/moderator"],
    ["admin", "/admin/login?return=%2Fadmin%23documents", "/admin#documents"],
  ]) {
    test(`Microsoft first for ${role} at ${width}px in all languages`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await mockLogin(page);
      await page.goto(entry);
      await expect(page.locator(".login-sso")).toHaveAttribute(
        "href",
        `/oauth2/start?rd=${encodeURIComponent(destination)}`,
      );
      await expect(page.locator('input[name="password"]')).toBeHidden();
      for (const [locale, label] of [
        ["FR", "Utiliser un identifiant et un mot de passe"],
        ["EN", "Use a username and password"],
        ["ES", "Usar un usuario y una contraseña"],
        ["SK", "Použiť používateľské meno a heslo"],
      ]) {
        await page.getByRole("button", { name: locale, exact: true }).click();
        const summary = page.locator(".login-alternative > summary");
        await expect(summary).toHaveText(label);
        await expect(page.locator('input[name="password"]')).toBeHidden();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (locale === "FR")
          await page.screenshot({
            path: info.outputPath("sso-first.png"),
            fullPage: true,
          });
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator('input[name="password"]')).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await summary.click();
      }
      await page.route("**/oauth2/start**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<h1>SSO destination</h1>",
        }),
      );
      await page.locator(".login-sso").click();
      await expect(
        page.getByRole("heading", { name: "SSO destination" }),
      ).toBeVisible();
      expect(new URL(page.url()).searchParams.get("rd")).toBe(destination);
    });
  }
}

for (const entry of ["/login", "/admin/login"]) {
  test(`credentials stay directly available without SSO on ${entry}`, async ({
    page,
  }) => {
    await mockLogin(page, { ...verifiedSso, ssoEnabled: false });
    await page.goto(entry);
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator(".login-sso, .login-alternative")).toHaveCount(0);
  });

  test(`explicit recovery keeps credentials open on ${entry}`, async ({
    page,
  }) => {
    await mockLogin(page, {
      ...verifiedSso,
      ssoLoginUrl: "/oauth2/start?rd=/",
    });
    await page.goto(`${entry}?local=1`);
    await expect(page.locator(".login-sso")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page).toHaveURL(/local=1/);
  });
}

test("admin recovery preserves MFA and the requested section", async ({
  page,
}) => {
  await mockLogin(page);
  await page.route("**/api/auth/login", async (route) => {
    const values = route.request().postDataJSON();
    await route.fulfill({
      status: values.mfaCode === "123456" ? 200 : 401,
      json: {},
    });
  });
  await page.goto("/admin/login?return=%2Fadmin%23documents");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator(".login-alternative > summary").click();
  await page.locator('input[name="username"]').fill("admin@example.test");
  await page.locator('input[name="password"]').fill("test-only-password");
  await page
    .getByRole("button", { name: "Sign in to administration", exact: true })
    .click();
  await expect(page.getByLabel("MFA code", { exact: true })).toBeVisible();
  await page.getByLabel("MFA code", { exact: true }).fill("123456");
  await page.route("**/admin", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Admin destination</h1>",
    }),
  );
  await page
    .getByRole("button", { name: "Sign in to administration", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin#documents$/);
});

for (const destination of ["/explorer", "/moderator"]) {
  test(`directory recovery keeps the return path ${destination}`, async ({
    page,
  }) => {
    await mockLogin(page);
    await page.route("**/api/auth/directory-login", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.goto(`/login?return=${encodeURIComponent(destination)}`);
    await page.locator(".login-alternative > summary").click();
    await page.locator('input[name="login"]').fill("member@example.test");
    await page.locator('input[name="password"]').fill("test-only-password");
    await page.route(`**${destination}`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Directory destination</h1>",
      }),
    );
    await page
      .locator('button[type="submit"], .login-form button.primary')
      .click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

test("moderator session recovery retains document filters", async ({
  page,
}) => {
  await mockLogin(page);
  const destination =
    "/moderator?space=it&status=DRAFT&page=2#moderator-documents";
  await page.goto(destination);
  await expect(page.locator(".login-sso")).toHaveAttribute(
    "href",
    `/oauth2/start?rd=${encodeURIComponent(destination)}`,
  );
  expect(new URL(page.url()).searchParams.get("return")).toBe(destination);
});

test("administrator reconnect preserves query parameters and section", async ({
  page,
}) => {
  await mockLogin(page);
  const destination = "/admin?q=travel%20policy#documents";
  await page.goto(destination);
  await expect(page.locator(".login-sso")).toHaveAttribute(
    "href",
    `/oauth2/start?rd=${encodeURIComponent(destination)}`,
  );
  expect(new URL(page.url()).searchParams.get("return")).toBe(destination);
});

test("admin SSO cannot return to an external or non-admin destination", async ({
  page,
}) => {
  await mockLogin(page);
  for (const destination of [
    "//untrusted.example/",
    "/administrator",
    "/explorer",
  ]) {
    await page.goto(`/admin/login?return=${encodeURIComponent(destination)}`);
    await expect(page.locator(".login-sso")).toHaveAttribute(
      "href",
      "/oauth2/start?rd=%2Fadmin",
    );
  }
});
