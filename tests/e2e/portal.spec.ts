import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

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

test('AD groups can be added, suggested in search and deleted', async ({ page, request }) => {
  const suffix = Date.now().toString(36);
  const name = `TEST-AD-${suffix}`;
  const createdResponse = await request.post('/api/admin/groups', {
    data: {
      name,
      distinguishedName: `CN=${name},OU=Groups,DC=demo,DC=local`,
      description: 'Playwright group lifecycle',
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json() as { id: string };

  try {
    const searchResponse = await request.get(`/api/admin/groups?q=${encodeURIComponent(name)}`);
    expect(searchResponse.ok()).toBeTruthy();
    expect((await searchResponse.json() as Array<{ name: string }>).map((group) => group.name)).toContain(name);

    await page.goto('/admin#groups');
    const search = page.getByPlaceholder('Rechercher ou sélectionner un groupe AD…');
    await search.fill(name);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.locator('#ad-group-suggestions').locator(`option[value="${name}"]`)).toHaveCount(1);
  } finally {
    const deletedResponse = await request.delete(`/api/admin/groups/${created.id}`);
    expect(deletedResponse.ok()).toBeTruthy();
    expect((await deletedResponse.json()).deleted).toBe(true);
  }
});

test('public and administration routes respond and document capabilities are explicit', async ({ request }) => {
  const routes = [
    '/api/health/live',
    '/api/health/ready',
    '/api/health/details',
    '/api/metrics',
    '/api/me',
    '/api/documents',
    '/api/admin/check',
    '/api/admin/dashboard',
    '/api/admin/groups',
    '/api/admin/access-rules',
    '/api/admin/spaces',
    '/api/admin/documents',
    '/api/admin/directory-connections',
    '/api/admin/certificates',
    '/api/admin/audit',
    '/api/admin/settings',
  ];
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
  }

  const documents = await (await request.get('/api/documents')).json() as Array<{
    id: string;
    permissions: { preview: boolean; download: boolean };
  }>;
  expect(documents.length).toBeGreaterThan(0);
  expect(documents[0].permissions).toEqual({ preview: true, download: true });
  expect((await request.get(`/api/documents/${documents[0].id}`)).status()).toBe(200);
  expect((await request.get(`/api/documents/${documents[0].id}/content?locale=fr`)).status()).toBe(200);
  expect((await request.get(`/api/documents/${documents[0].id}/download?locale=fr`)).status()).toBe(200);
  expect((await request.get('/api/documents/not-a-document')).status()).toBe(404);
});

test('Word and Excel documents open in a read-only viewer', async ({ page, request }) => {
  const spaces = await (await request.get('/api/admin/spaces')).json() as Array<{ id: string; slug: string }>;
  const spaceId = spaces.find((space) => space.slug === 'general')?.id;
  expect(spaceId).toBeTruthy();
  const suffix = Date.now().toString(36);
  const wordTitle = `Word lecture seule ${suffix}`;
  const excelTitle = `Excel lecture seule ${suffix}`;
  const docx = zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contenu Word sécurisé en lecture seule</w:t></w:r></w:p></w:body></w:document>'),
  });
  const xlsx = zipSync({
    'xl/sharedStrings.xml': strToU8('<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Contrôle</t></si><si><t>Conforme</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>'),
  });
  const createdIds: string[] = [];

  try {
    for (const item of [
      { title: wordTitle, name: 'lecture-seule.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx },
      { title: excelTitle, name: 'lecture-seule.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx },
    ]) {
      const response = await request.post('/api/admin/documents', {
        multipart: {
          spaceId: spaceId || '',
          locale: 'fr',
          title: item.title,
          file: { name: item.name, mimeType: item.mimeType, buffer: Buffer.from(item.buffer) },
        },
      });
      expect(response.status(), item.name).toBe(201);
      const created = await response.json() as { id: string };
      createdIds.push(created.id);
      expect((await request.post(`/api/admin/documents/${created.id}/publish`)).status()).toBe(201);
    }

    await page.goto('/');
    const search = page.getByPlaceholder('Rechercher une politique, une procédure ou un guide…');
    await search.fill(wordTitle);
    await page.getByText(wordTitle, { exact: true }).first().click();
    await expect(page.getByText('Consultation en lecture seule')).toBeVisible();
    await expect(page.getByText('Contenu Word sécurisé en lecture seule')).toBeVisible();
    await page.getByRole('button', { name: 'Fermer' }).click();

    await search.fill(excelTitle);
    await page.getByText(excelTitle, { exact: true }).first().click();
    await expect(page.getByText('Consultation en lecture seule')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Contrôle' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Conforme' })).toBeVisible();
  } finally {
    await Promise.all(createdIds.map((id) => request.post(`/api/admin/documents/${id}/archive`)));
  }
});
