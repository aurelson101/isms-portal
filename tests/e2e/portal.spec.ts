import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { strToU8, zipSync } from "fflate";

test("navigation, filtering, search and languages are functional", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await expect(page.getByText(/Mode démonstration/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Bienvenue/ })).toBeVisible();
  await expect(
    page.getByText("Politique de sécurité de l’information"),
  ).toHaveCount(0);

  await page.locator("aside").getByText("Politiques", { exact: true }).click();
  await expect(page).toHaveURL(/\/explorer\?category=policies/);
  await expect(
    page.getByRole("heading", { name: "Explorateur documentaire", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Politique de sécurité de l’information").first(),
  ).toBeVisible();

  for (const [label, value] of [
    ["Procédures", "procedures"],
    ["Guides", "guides"],
  ] as const) {
    await page.locator("aside").getByText(label, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`category=${value}`));
  }
  await page.locator("aside").getByText("IT", { exact: true }).click();
  await expect(page).toHaveURL(/space=it/);

  const search = page.getByRole("textbox", {
    name: /Rechercher une politique/,
  });
  await search.fill("VPN");
  await expect(page.getByText("Guide d’utilisation du VPN")).toBeVisible();

  await page
    .locator("header")
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Document explorer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /Search for a policy/ }),
  ).toBeVisible();
});

test("document preview and binary download work", async ({ page, request }) => {
  await page.goto("/explorer?category=policies");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await page.getByRole("button", { name: "Ouvrir" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("iframe")).toBeVisible();
  const download = dialog.getByRole("link", { name: "Télécharger" });
  const href = await download.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("category explorer supports window and list views with an expandable reader", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await page.locator("aside").getByText("Procédures", { exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Procédures", exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Explorateur documentaire", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Affichage en fenêtres" }).click();
  await expect(page.locator(".documents")).toHaveClass(/document-grid/);
  await page.getByRole("button", { name: "Affichage en liste" }).click();
  await expect(page.locator(".documents")).toHaveClass(/document-list/);

  await page
    .locator(".documents")
    .getByRole("button", { name: "Ouvrir" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Agrandir le lecteur" }).click();
  await expect(dialog).toHaveClass(/expanded/);
  await dialog.getByRole("button", { name: "Réduire le lecteur" }).click();
  await expect(dialog).not.toHaveClass(/expanded/);
});

test("document explorer paginates ten documents with next and previous controls", async ({
  page,
  request,
}) => {
  const sourceDocuments = (await (
    await request.get("/api/documents")
  ).json()) as Array<Record<string, unknown>>;
  expect(sourceDocuments.length).toBeGreaterThan(0);
  const documents = Array.from({ length: 11 }, (_, index) => ({
    ...sourceDocuments[0],
    id: `pagination-document-${index + 1}`,
    translations: [
      {
        locale: "fr",
        title: `Document pagination ${index + 1}`,
        description: null,
      },
    ],
  }));
  await page.route("**/api/documents?**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.searchParams.has("page")) {
      await route.continue();
      return;
    }
    const currentPage = Number(url.searchParams.get("page")) || 1;
    const start = (currentPage - 1) * 10;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: documents.slice(start, start + 10),
        page: currentPage,
        limit: 10,
        total: documents.length,
        totalPages: 2,
      }),
    });
  });

  await page.goto("/explorer?space=general");
  await expect(page.locator(".documents > *")).toHaveCount(10);
  await page.getByRole("button", { name: /Suivant/ }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Document pagination 11")).toBeVisible();
  await expect(page.locator(".documents > *")).toHaveCount(1);
  await page.getByRole("button", { name: /Précédent/ }).click();
  await expect(page).not.toHaveURL(/page=2/);
  await expect(
    page.getByRole("button", { name: "Document pagination 1", exact: true }),
  ).toBeVisible();
});

test("administration uses live APIs and every menu opens a section", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord" }),
  ).toBeVisible();
  await expect(page.getByText("Groupes AD synchronisés")).toBeVisible();

  for (const heading of [
    "Groupes Active Directory",
    "Gestion des droits d’accès",
    "Espaces documentaires",
    "Documents",
    "Synchronisation LDAP/LDAPS",
    "Certificats CA",
    "Journal d’audit",
    "Santé des services",
    "Configuration",
  ]) {
    const menuLabel =
      heading === "Gestion des droits d’accès"
        ? "Règles d’accès"
        : heading === "Synchronisation LDAP/LDAPS"
          ? "Synchronisation LDAP"
          : heading;
    await page
      .getByRole("button", { name: new RegExp(`${menuLabel}$`) })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
});

test("administration is fully switchable between French and English", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Demo session")).toBeVisible();

  for (const [menu, heading] of [
    ["Active Directory groups", "Active Directory groups"],
    ["Access rules", "Access rights management"],
    ["Document spaces", "Document spaces"],
    ["Documents", "Documents"],
    ["LDAP synchronization", "LDAP/LDAPS synchronization"],
    ["CA certificates", "CA certificates"],
    ["Audit log", "Audit log"],
    ["Service health", "Service health"],
    ["Settings", "Settings"],
  ] as const) {
    await page.getByRole("button", { name: menu, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configuration" }),
  ).toBeVisible();
  await expect(page.getByText("Session de démonstration")).toBeVisible();
});

test("administration uses accessible confirmations and edits an existing directory connector", async ({
  page,
}) => {
  await page.goto("/admin#rules");
  await expect(
    page.getByRole("heading", { name: "Gestion des droits d’accès" }),
  ).toBeVisible();
  await page.locator(".matrix tbody tr").first().click();
  await page
    .locator(".drawer")
    .getByRole("button", { name: "Supprimer" })
    .click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: "Annuler" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();

  const connection = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Directory test",
    domain: "corp.example.local",
    primaryHost: "dc01.corp.example.local",
    secondaryHost: "dc02.corp.example.local",
    port: 389,
    protocol: "LDAP",
    baseDn: "DC=corp,DC=example,DC=local",
    userBaseDn: "OU=Users,DC=corp,DC=example,DC=local",
    groupBaseDn: "OU=Groups,DC=corp,DC=example,DC=local",
    bindDn: "CN=Service,OU=Users,DC=corp,DC=example,DC=local",
    userFilter: "(objectClass=user)",
    groupFilter: "(objectClass=group)",
    usernameAttribute: "sAMAccountName",
    groupAttribute: "cn",
    emailAttribute: "mail",
    nestedGroups: true,
    syncIntervalMinutes: 60,
    timeoutMs: 5000,
    retries: 2,
    enabled: false,
    caCertificateId: null,
    lastTestStatus: null,
  };
  await page.route("**/api/admin/directory-connections", async (route) => {
    await route.fulfill({ json: [connection] });
  });
  await page.route(
    `**/api/admin/directory-connections/${connection.id}`,
    async (route) => {
      expect(route.request().method()).toBe("PUT");
      const payload = route.request().postDataJSON() as {
        name: string;
        bindSecret?: string;
      };
      expect(payload.name).toBe(connection.name);
      expect(payload.bindSecret).toBe("");
      await route.fulfill({ json: connection });
    },
  );

  await page.getByRole("button", { name: "Actualiser" }).click();
  await page
    .locator("aside")
    .getByRole("button", { name: "Synchronisation LDAP" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synchronisation LDAP/LDAPS" }),
  ).toBeVisible();
  await page
    .locator(".admin-card")
    .first()
    .getByRole("button", { name: "Modifier" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Modifier le connecteur" }),
  ).toBeVisible();
  await expect(page.locator('input[name="bindSecret"]')).not.toHaveAttribute(
    "required",
  );
  await page
    .getByRole("button", { name: "Enregistrer les modifications" })
    .click();
  await expect(page.getByText("Connecteur modifié.")).toBeVisible();
});

for (const [format, fixture] of [
  ["DER X.509", "tests/fixtures/test-ca.der.cer"],
  ["ADCS PKCS#7", "tests/fixtures/test-adcs-chain.cer"],
] as const) {
  test(`a ${format} CA certificate can be imported from the administration`, async ({
    page,
    request,
  }) => {
    const name = `CA ${format} test ${Date.now()}`;
    let certificateId = "";
    try {
      await page.goto("/admin#certificates");
      await expect(
        page.getByRole("heading", { name: "Certificats CA" }),
      ).toBeVisible();
      await page.getByPlaceholder("Nom convivial").fill(name);
      await page.locator('input[type="file"]').setInputFiles(fixture);
      await page.getByRole("button", { name: "Importer" }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
      await expect(page.getByText(/ISMS DER Test CA/).first()).toBeVisible();

      const certificates = (await (
        await request.get("/api/admin/certificates")
      ).json()) as Array<{ id: string; name: string }>;
      certificateId =
        certificates.find((certificate) => certificate.name === name)?.id || "";
      expect(certificateId).toBeTruthy();
    } finally {
      if (certificateId)
        await request.delete(`/api/admin/certificates/${certificateId}`);
    }
  });
}

test("categories can be created, edited and deleted", async ({ request }) => {
  const spacesResponse = await request.get("/api/admin/spaces");
  expect(spacesResponse.ok()).toBeTruthy();
  const spaces = (await spacesResponse.json()) as Array<{ id: string }>;
  expect(spaces.length).toBeGreaterThan(0);

  const suffix = Date.now().toString(36);
  const createdResponse = await request.post("/api/admin/categories", {
    data: {
      spaceId: spaces[0].id,
      slug: `test-${suffix}`,
      nameFr: `Catégorie test ${suffix}`,
      nameEn: `Test category ${suffix}`,
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as { id: string };

  const updatedResponse = await request.put(
    `/api/admin/categories/${created.id}`,
    {
      data: {
        spaceId: spaces[0].id,
        slug: `test-modifie-${suffix}`,
        nameFr: `Catégorie modifiée ${suffix}`,
        nameEn: `Updated category ${suffix}`,
      },
    },
  );
  expect(updatedResponse.ok()).toBeTruthy();
  expect((await updatedResponse.json()).nameFr).toBe(
    `Catégorie modifiée ${suffix}`,
  );

  const deletedResponse = await request.delete(
    `/api/admin/categories/${created.id}`,
  );
  expect(deletedResponse.ok()).toBeTruthy();
  expect((await deletedResponse.json()).deleted).toBe(true);
});

test("portal and administration remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("aside nav")).toBeVisible();
  await expect(page.locator("aside nav svg")).toHaveCount(8);
  await page.locator("aside").getByText("Guides", { exact: true }).click();
  await expect(page).toHaveURL(/\/explorer\?category=guides/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto("/admin");
  await expect(page.locator(".admin-shell > aside")).toBeVisible();
  await page.locator("aside").getByText("Documents", { exact: true }).click();
  await expect(page).toHaveURL(/#documents/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("AD groups can be added, suggested in search and deleted", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const name = `TEST-AD-${suffix}`;
  const createdResponse = await request.post("/api/admin/groups", {
    data: {
      name,
      distinguishedName: `CN=${name},OU=Groups,DC=demo,DC=local`,
      description: "Playwright group lifecycle",
    },
  });
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as { id: string };

  try {
    const searchResponse = await request.get(
      `/api/admin/groups?q=${encodeURIComponent(name)}`,
    );
    expect(searchResponse.ok()).toBeTruthy();
    expect(
      ((await searchResponse.json()) as Array<{ name: string }>).map(
        (group) => group.name,
      ),
    ).toContain(name);

    await page.goto("/admin#groups");
    const search = page.getByPlaceholder(
      "Rechercher ou sélectionner un groupe AD…",
    );
    await search.fill(name);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(
      page.locator("#ad-group-suggestions").locator(`option[value="${name}"]`),
    ).toHaveCount(1);
  } finally {
    const deletedResponse = await request.delete(
      `/api/admin/groups/${created.id}`,
    );
    expect(deletedResponse.ok()).toBeTruthy();
    expect((await deletedResponse.json()).deleted).toBe(true);
  }
});

test("access rules can be created, updated and deleted", async ({
  request,
}) => {
  const suffix = Date.now().toString(36);
  const groupResponse = await request.post("/api/admin/groups", {
    data: {
      name: `TEST-RULE-${suffix}`,
      distinguishedName: `CN=TEST-RULE-${suffix},OU=Groups,DC=demo,DC=local`,
    },
  });
  expect(groupResponse.status()).toBe(201);
  const group = (await groupResponse.json()) as { id: string };
  const spaces = (await (
    await request.get("/api/admin/spaces")
  ).json()) as Array<{ id: string }>;
  let ruleId = "";

  try {
    const createdResponse = await request.post("/api/admin/access-rules", {
      data: {
        groupId: group.id,
        spaceId: spaces[0].id,
        showMenu: true,
        read: true,
        search: true,
        preview: true,
        download: false,
        upload: false,
        edit: false,
        publish: false,
        archive: false,
        administer: false,
      },
    });
    expect(createdResponse.status()).toBe(201);
    ruleId = ((await createdResponse.json()) as { id: string }).id;

    const updatedResponse = await request.put(
      `/api/admin/access-rules/${ruleId}`,
      {
        data: {
          groupId: group.id,
          spaceId: spaces[0].id,
          showMenu: true,
          read: true,
          search: true,
          preview: true,
          download: true,
          upload: false,
          edit: false,
          publish: false,
          archive: false,
          administer: false,
        },
      },
    );
    expect(updatedResponse.ok()).toBeTruthy();
    expect((await updatedResponse.json()).download).toBe(true);
  } finally {
    if (ruleId)
      expect(
        (await request.delete(`/api/admin/access-rules/${ruleId}`)).ok(),
      ).toBeTruthy();
    expect(
      (await request.delete(`/api/admin/groups/${group.id}`)).ok(),
    ).toBeTruthy();
  }
});

test("public and administration routes respond and document capabilities are explicit", async ({
  page,
  request,
}) => {
  await page.waitForTimeout(2_000);
  const routes = [
    "/api/health/live",
    "/api/health/ready",
    "/api/health/details",
    "/api/metrics",
    "/api/me",
    "/api/documents",
    "/api/admin/check",
    "/api/admin/dashboard",
    "/api/admin/groups",
    "/api/admin/access-rules",
    "/api/admin/spaces",
    "/api/admin/documents",
    "/api/admin/directory-connections",
    "/api/admin/certificates",
    "/api/admin/audit",
    "/api/admin/settings",
  ];
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    await page.waitForTimeout(75);
  }

  const documents = (await (
    await request.get("/api/documents")
  ).json()) as Array<{
    id: string;
    permissions: { preview: boolean; download: boolean };
  }>;
  expect(documents.length).toBeGreaterThan(0);
  const firstPageResponse = await request.get(
    "/api/documents?page=1&limit=1&sort=recent",
  );
  expect(firstPageResponse.status()).toBe(200);
  const firstPage = (await firstPageResponse.json()) as {
    items: Array<{ id: string }>;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  expect(firstPage.page).toBe(1);
  expect(firstPage.limit).toBe(1);
  expect(firstPage.items).toHaveLength(1);
  expect(firstPage.total).toBe(documents.length);
  const clampedPage = (await (
    await request.get("/api/documents?page=999999&limit=1&sort=recent")
  ).json()) as { page: number; totalPages: number };
  expect(clampedPage.page).toBe(Math.max(1, clampedPage.totalPages));
  if (firstPage.totalPages > 1) {
    const secondPage = (await (
      await request.get("/api/documents?page=2&limit=1&sort=recent")
    ).json()) as { items: Array<{ id: string }> };
    expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id);
  }
  expect(documents[0].permissions).toEqual({ preview: true, download: true });
  expect(
    (await request.get(`/api/documents/${documents[0].id}`)).status(),
  ).toBe(200);
  expect(
    (
      await request.get(`/api/documents/${documents[0].id}/content?locale=fr`)
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get(`/api/documents/${documents[0].id}/download?locale=fr`)
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/documents/not-a-document")).status()).toBe(
    404,
  );
});

test("Word and Excel documents open in a read-only viewer", async ({
  page,
  request,
}) => {
  const spaces = (await (
    await request.get("/api/admin/spaces")
  ).json()) as Array<{ id: string; slug: string }>;
  const spaceId = spaces.find((space) => space.slug === "general")?.id;
  expect(spaceId).toBeTruthy();
  const suffix = Date.now().toString(36);
  const wordTitle = `Word lecture seule ${suffix}`;
  const excelTitle = `Excel lecture seule ${suffix}`;
  const docx = zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contenu Word sécurisé en lecture seule</w:t></w:r></w:p></w:body></w:document>',
    ),
  });
  const xlsx = zipSync({
    "xl/sharedStrings.xml": strToU8(
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Contrôle</t></si><si><t>Conforme</t></si></sst>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>',
    ),
  });
  const createdIds: string[] = [];

  try {
    for (const item of [
      {
        title: wordTitle,
        name: "lecture-seule.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: docx,
      },
      {
        title: excelTitle,
        name: "lecture-seule.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsx,
      },
    ]) {
      const response = await request.post("/api/admin/documents", {
        multipart: {
          spaceId: spaceId || "",
          locale: "fr",
          title: item.title,
          file: {
            name: item.name,
            mimeType: item.mimeType,
            buffer: Buffer.from(item.buffer),
          },
        },
      });
      expect(response.status(), item.name).toBe(201);
      const created = (await response.json()) as { id: string };
      createdIds.push(created.id);
      expect(
        (
          await request.post(`/api/admin/documents/${created.id}/publish`)
        ).status(),
      ).toBe(201);
    }

    await page.goto(`/explorer?q=${encodeURIComponent(wordTitle)}`);
    const search = page.getByPlaceholder(
      "Rechercher une politique, une procédure ou un guide…",
    );
    await search.fill(wordTitle);
    await page.getByText(wordTitle, { exact: true }).first().click();
    await expect(page.getByText("Consultation en lecture seule")).toBeVisible();
    await expect(
      page.getByText("Contenu Word sécurisé en lecture seule"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fermer" }).click();

    await search.fill(excelTitle);
    await page.getByText(excelTitle, { exact: true }).first().click();
    await expect(page.getByText("Consultation en lecture seule")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Contrôle" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Conforme" })).toBeVisible();

    await page.goto("/admin#documents");
    await page
      .locator("header")
      .getByRole("button", { name: "FR", exact: true })
      .click();
    let row = page.getByRole("row").filter({ hasText: wordTitle });
    await row.getByRole("button", { name: "Archiver" }).click();
    row = page.getByRole("row").filter({ hasText: wordTitle });
    await expect(row.getByRole("button", { name: "Restaurer" })).toHaveClass(
      /restore/,
    );
    await row.getByRole("button", { name: "Restaurer" }).click();
    row = page.getByRole("row").filter({ hasText: wordTitle });
    await expect(row.getByRole("button", { name: "Publier" })).toHaveClass(
      /publish/,
    );
    await row.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(row).toHaveCount(0);
    createdIds.shift();
  } finally {
    for (const id of createdIds) {
      expect(
        (await request.delete(`/api/admin/documents/${id}`)).status(),
      ).toBe(200);
    }
  }
});

test("the audit journal automatically retains at most 20 events", async ({
  request,
}) => {
  const response = await request.get("/api/admin/audit?limit=200");
  expect(response.status()).toBe(200);
  const audit = (await response.json()) as {
    items: unknown[];
    total: number;
  };
  expect(audit.total).toBeLessThanOrEqual(20);
  expect(audit.items).toHaveLength(audit.total);
});

test("portal and administration have no serious accessibility violations", async ({
  page,
}) => {
  for (const route of ["/", "/admin"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact || ""),
    );
    expect(violations, route).toEqual([]);
  }
});
