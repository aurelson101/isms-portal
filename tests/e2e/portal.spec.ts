import { expect, test } from '@playwright/test';

test('navigation, filtering, search and languages are functional', async ({ page }) => {
  await page.goto('/');
  await page.locator('header').getByRole('button', { name: 'FR', exact: true }).click();
  await expect(page.getByText(/Mode démonstration/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
  await expect(page.getByText('Politique de sécurité de l’information').first()).toBeVisible();

  await page.locator('aside').getByText('Politiques', { exact: true }).click();
  await expect(page.getByText('Politique de sécurité de l’information').first()).toBeVisible();

  const search = page.getByRole('textbox', { name: /Rechercher une politique/ });
  await search.fill('VPN');
  await expect(page.getByText('Guide d’utilisation du VPN')).toBeVisible();

  await page.locator('header').getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Search for a policy/ })).toBeVisible();
});

test('document preview and binary download work', async ({ page, request }) => {
  await page.goto('/');
  await page.locator('header').getByRole('button', { name: 'FR', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('iframe')).toBeVisible();
  const download = dialog.getByRole('link', { name: 'Télécharger' });
  const href = await download.getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('administration uses live APIs and every menu opens a section', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await expect(page.getByText('Groupes AD synchronisés')).toBeVisible();

  for (const heading of [
    'Groupes Active Directory',
    'Gestion des droits d’accès',
    'Espaces documentaires',
    'Documents',
    'Synchronisation LDAP/LDAPS',
    'Certificats CA',
    'Journal d’audit',
    'Santé des services',
    'Configuration',
  ]) {
    const menuLabel = heading === 'Gestion des droits d’accès' ? 'Règles d’accès'
      : heading === 'Synchronisation LDAP/LDAPS' ? 'Synchronisation LDAP'
      : heading;
    await page.getByRole('button', { name: new RegExp(`${menuLabel}$`) }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
});
