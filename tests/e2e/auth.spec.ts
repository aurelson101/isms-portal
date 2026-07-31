import { expect, test } from "@playwright/test";

test("the generated administrator can sign in and manage the secure profile", async ({
  page,
}) => {
  const username = process.env.INITIAL_ADMIN_USERNAME;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  test.skip(
    !username || !password,
    "Generated administrator credentials required",
  );

  await page.goto("/login?fallback=admin");
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.getByLabel("Identifiant").fill(username!);
  await page.getByLabel("Mot de passe").fill(password!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/admin/);

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await page.getByRole("button", { name: /Configuration$/ }).click();
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
});
