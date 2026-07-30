import { expect, test } from '@playwright/test';

test('navigation, filtering, search and languages are functional', async ({ page }) => {
  await page.goto('/');
  await page.locator('header').getByRole('button', { name: 'FR', exact: true }).click();
  await expect(page.getByText(/Mode démonstration/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bienvenue/ })).toBeVisible();
  await expect(page.getByText('Politique de sécurité de l’information').first()).toBeVisible();

  await page.locator('aside').getByText('Politiques', { exact: true }).click();
  await expect(page).toHaveURL(/category=policies/);
  await expect(page.getByText('Politique de sécurité de l’information').first()).toBeVisible();

  for (const [label, value] of [['Procédures', 'procedures'], ['Guides', 'guides']] as const) {
    await page.locator('aside').getByText(label, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`category=${value}`));
  }
  await page.locator('aside').getByText('IT', { exact: true }).click();
  await expect(page).toHaveURL(/space=it/);

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

test('categories can be created, edited and deleted', async ({ request }) => {
  const spacesResponse = await request.get('/api/admin/spaces');
  expect(spacesResponse.ok()).toBeTruthy();
  const spaces = await spacesResponse.json() as Array<{ id: string }>;
  expect(spaces.length).toBeGreaterThan(0);

  const suffix = Date.now().toString(36);
  const createdResponse = await request.post('/api/admin/categories', {
    data: {
      spaceId: spaces[0].id,
      slug: `test-${suffix}`,
      nameFr: `Catégorie test ${suffix}`,
      nameEn: `Test category ${suffix}`,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { id: string };

  const updatedResponse = await request.put(`/api/admin/categories/${created.id}`, {
    data: {
      spaceId: spaces[0].id,
      slug: `test-modifie-${suffix}`,
      nameFr: `Catégorie modifiée ${suffix}`,
      nameEn: `Updated category ${suffix}`,
    },
  });
  expect(updatedResponse.ok()).toBeTruthy();
  expect((await updatedResponse.json()).nameFr).toBe(`Catégorie modifiée ${suffix}`);

  const deletedResponse = await request.delete(`/api/admin/categories/${created.id}`);
  expect(deletedResponse.ok()).toBeTruthy();
  expect((await deletedResponse.json()).deleted).toBe(true);
});

test('portal and administration remain usable on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('aside nav')).toBeVisible();
  await expect(page.locator('aside nav svg')).toHaveCount(8);
  await page.locator('aside').getByText('Guides', { exact: true }).click();
  await expect(page).toHaveURL(/category=guides/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.goto('/admin');
  await expect(page.locator('.admin-shell > aside')).toBeVisible();
  await page.locator('aside').getByText('Documents', { exact: true }).click();
  await expect(page).toHaveURL(/#documents/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
