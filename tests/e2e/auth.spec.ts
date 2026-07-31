import { expect, test } from "@playwright/test";

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

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await page
    .getByRole("button", { name: /Administrateur ISMS.*admin/i })
    .click();
  await expect(page.getByRole("menuitem", { name: "Mon profil" })).toBeVisible();
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

  await page
    .getByRole("button", { name: /Administrateur ISMS.*admin/i })
    .click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/admin\/login\?loggedout=1/);
});
