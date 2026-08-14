import { expect, test } from "./test";

test("the main sign-in page only exposes the user credentials form", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Identifiant", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
  await expect(page.getByText("Compte administrateur")).toHaveCount(0);
  await expect(page.getByText("Compte Active Directory")).toHaveCount(0);
});

test("the user sign-in page automatically detects an existing SSO session", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        directoryLoginEnabled: true,
        ssoEnabled: true,
        ssoLoginUrl: "/oauth2/start?rd=/",
      },
    }),
  );
  const ssoRequest = page.waitForRequest((request) =>
    request.url().includes("/oauth2/start"),
  );
  await page.goto("/login?return=/explorer");
  expect(new URL((await ssoRequest).url()).searchParams.get("rd")).toBe(
    "/explorer",
  );
});

test("local sign-in and signed-out pages do not immediately restart SSO", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        directoryLoginEnabled: true,
        ssoEnabled: true,
        ssoLoginUrl: "/oauth2/start?rd=/",
      },
    }),
  );
  let ssoRequests = 0;
  await page.route("**/oauth2/start**", (route) => {
    ssoRequests += 1;
    return route.abort();
  });

  await page.goto("/login?local=1");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(page.getByLabel("Identifiant", { exact: true })).toBeVisible();
  await page.goto("/login?loggedout=1");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByText("Vous êtes maintenant déconnecté."),
  ).toBeVisible();
  expect(ssoRequests).toBe(0);
});

test("the user profile lists groups recognized by the application", async ({
  page,
}) => {
  let refreshRequested = false;
  await page.route("**/api/me*", (route) => {
    refreshRequested ||=
      new URL(route.request().url()).searchParams.get("refresh") === "1";
    return route.fulfill({
      json: {
        username: "alice@example.com",
        displayName: "Alice Example",
        isAdmin: false,
        primaryAdmin: false,
        locale: "fr",
        authentication: {
          source: "directory-session",
          ssoConnected: false,
          sessionExpiresAt: "2026-08-01T17:03:19.052Z",
          loginUrl: null,
          logoutUrl: null,
          diagnostics: {
            groupCount: 187,
            matchedGroups: ["SkillsRDP"],
            mappedSpaceCount: 2,
            administrator: false,
            administratorAccount: false,
          },
        },
        spaces: [],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".account-button").click();

  await expect(page.getByText("Groupes détectés")).toBeVisible();
  await expect(
    page.getByText("Groupes reconnus dans l’application"),
  ).toBeVisible();
  const recognizedGroups = page.locator(".matched-groups");
  await recognizedGroups.locator("summary").click();
  await expect(recognizedGroups.getByText("SkillsRDP")).toBeVisible();
  expect(refreshRequested).toBe(true);
});

test("a non-admin session is redirected to the dedicated administrator sign-in", async ({
  page,
}) => {
  await page.route("**/api/admin/check", (route) =>
    route.fulfill({
      status: 403,
      json: { message: "Forbidden" },
    }),
  );
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login\?return=/);
});

test("an admin API forbidden response rechecks the identity and redirects a replaced session", async ({
  page,
}) => {
  let invalidateSession = false;
  await page.route("**/api/admin/check", async (route) => {
    if (!invalidateSession) return route.continue();
    return route.fulfill({
      status: 403,
      json: { message: "Forbidden" },
    });
  });
  await page.route(
    "**/api/admin/directory-connections/groups/search*",
    (route) => route.fulfill({ status: 403, json: { message: "Forbidden" } }),
  );
  await page.goto("/admin#groups");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Groupes Active Directory" }),
  ).toBeVisible();
  invalidateSession = true;
  await page
    .getByLabel("Rechercher ou saisir le DN du groupe AD")
    .fill("Skill");
  await expect(page).toHaveURL(/\/admin\/login\?return=/);
});

test("the generated administrator can sign in and manage the secure profile", async ({
  page,
}) => {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  test.skip(
    !username || !password,
    "Generated administrator credentials required",
  );

  await page.goto("/admin/login");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion administrateur" }),
  ).toBeVisible();
  await page.getByLabel("Identifiant administrateur").fill(username!);
  await page.getByLabel("Mot de passe").fill(password!);
  await page
    .getByRole("button", { name: "Se connecter à l’administration" })
    .click();
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/");
  await page.getByRole("button", { name: /Administrateur ISMS/ }).click();
  await expect(page.getByText("Groupes détectés")).toHaveCount(0);
  await page.goto("/admin");

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await page
    .getByRole("button", { name: /Administrateur ISMS.*admin/i })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Mon profil" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Se déconnecter" }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Mon profil" }).click();
  await expect(
    page.getByRole("heading", { name: "Profil administrateur" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Comptes administrateurs" }),
  ).toBeVisible();
  await expect(page.getByText("Administrateur ISMS — admin")).toBeVisible();

  const setup = await page.request.post("/api/admin/accounts/me/mfa/setup");
  expect(setup.ok()).toBe(true);
  const payload = (await setup.json()) as {
    secret: string;
    otpauthUrl: string;
  };
  expect(payload.secret).toMatch(/^[A-Z2-7]{32}$/);
  expect(payload.otpauthUrl).toContain("otpauth://totp/");
  const disable = await page.request.delete("/api/admin/accounts/me/mfa");
  expect(disable.ok()).toBe(true);

  // The global E2E storage state is shared by the following portal scenarios.
  // Clearing this browser context verifies the protected redirect without
  // revoking that prepared server-side session.
  await page.context().clearCookies();
  const redirect = await page.request.get("/admin", { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers().location).toContain("/admin/login?return=/admin");
});
