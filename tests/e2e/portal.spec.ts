import { expect, test } from "./test";
import AxeBuilder from "@axe-core/playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

test.beforeEach(async ({ page }) => {
  const response = await page.request.put("/api/user-tools/preferences", {
    data: { locale: "fr", viewMode: "list", density: "comfortable" },
  });
  expect(response.ok()).toBe(true);
});

test("navigation, filtering, search and languages are functional", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Bienvenue/ })).toBeVisible();
  await expect(
    page.getByText("Politique de sécurité de l’information"),
  ).toHaveCount(0);
  const homeCards = page.locator(".cards article");
  expect(await homeCards.count()).toBeGreaterThan(0);
  for (const card of await homeCards.all()) {
    const iconBox = await card.locator(".card-icon").boundingBox();
    const titleBox = await card
      .getByRole("heading", { level: 2 })
      .boundingBox();
    expect(iconBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(iconBox!.y + iconBox!.height).toBeLessThanOrEqual(titleBox!.y + 1);
  }

  await page
    .locator("aside")
    .getByRole("button", { name: /Documents généraux.*sous-menus/ })
    .click();
  await page
    .locator("aside")
    .getByText("Politiques", { exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/explorer\?space=general&category=[a-z0-9-]+/);
  await expect(
    page.getByRole("heading", { name: "Explorateur documentaire", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Politique de sécurité de l’information").first(),
  ).toBeVisible();

  await page
    .locator("aside")
    .getByText("Procédures", { exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/category=[a-z0-9-]+/);
  await page
    .locator("aside")
    .getByRole("button", { name: /IT.*sous-menus/ })
    .click();
  await page
    .locator("aside")
    .getByText("Guides", { exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/category=[a-z0-9-]+/);
  await page
    .locator("aside")
    .getByRole("button", { name: "Tous les documents de l’espace" })
    .last()
    .click();
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

test("personal favorites follow the signed-in account and remain ACL-filtered", async ({
  page,
}) => {
  await page.goto("/explorer");
  const firstDocument = page.locator(".document").first();
  await expect(firstDocument).toBeVisible();
  const title = (
    await firstDocument.locator(".document-title").innerText()
  ).trim();

  await firstDocument
    .getByRole("button", { name: "Ajouter aux favoris" })
    .click();
  await expect(
    firstDocument.getByRole("button", { name: "Retirer des favoris" }),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("button", { name: "Mes favoris" })
    .click();
  await expect(page).toHaveURL(/favorites=true/);
  const favoriteRow = page.locator(".document").filter({ hasText: title });
  await expect(favoriteRow).toBeVisible();
  await favoriteRow
    .getByRole("button", { name: "Retirer des favoris" })
    .click();
  await expect(favoriteRow).toHaveCount(0);

  await page
    .locator("header")
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My favorites", level: 2 }),
  ).toBeVisible();
});

test("the reader FAV action updates the favorites view", async ({ page }) => {
  await page.goto("/explorer");
  const row = page.locator(".document").first();
  const title = (await row.locator(".document-title").innerText()).trim();
  await row.getByRole("button", { name: "Ouvrir" }).click();
  const dialog = page.getByRole("dialog");
  const fav = dialog.getByRole("button", { name: /favoris/ });
  if ((await fav.getAttribute("aria-pressed")) === "true") await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "false");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", "true");
  await expect(fav).toContainText("★ FAV");
  await dialog.getByRole("button", { name: "Fermer" }).click();

  await page.goto("/explorer?favorites=true");
  const favoriteRow = page.locator(".document").filter({ hasText: title });
  await expect(favoriteRow).toBeVisible();
  await favoriteRow
    .getByRole("button", { name: "Retirer des favoris" })
    .click();
  await expect(favoriteRow).toHaveCount(0);
});

test("advanced document filters are combinable, URL-persistent and bilingual", async ({
  page,
  request,
}) => {
  await page.goto("/explorer");
  await page.getByLabel("Tous les formats").selectOption("pdf");
  await page.getByLabel("Toutes les langues").selectOption("fr");
  await page.getByLabel("Tous les documents").selectOption("false");
  await expect(page).toHaveURL(/format=pdf/);
  await expect(page).toHaveURL(/locale=fr/);
  await expect(page).toHaveURL(/sensitive=false/);

  const response = await request.get(
    "/api/documents?page=1&limit=100&format=pdf&locale=fr",
  );
  expect(response.status()).toBe(200);
  const result = (await response.json()) as {
    items: Array<{
      versions: Array<{
        locale: string;
        storedFile: { mimeType: string };
      }>;
    }>;
  };
  for (const document of result.items) {
    expect(
      document.versions.some(
        (version) =>
          version.locale === "fr" &&
          version.storedFile.mimeType === "application/pdf",
      ),
    ).toBe(true);
  }

  await page
    .locator("header")
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await expect(page.getByLabel("All formats")).toHaveValue("pdf");
  await expect(page.getByLabel("All languages")).toHaveValue("fr");
  await expect(page.getByLabel("All documents")).toHaveValue("false");
});

test("mobile navigation stays compact and remains fully usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const navigation = page.getByRole("navigation", {
    name: "Navigation principale",
  });
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Accueil", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigation).toBeHidden();
});

test("the contextual help center explains access and refreshes permissions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Aide" }).click();
  const dialog = page.getByRole("dialog", { name: "Centre d’aide ISMS" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Trouver un document")).toBeVisible();
  await expect(dialog.getByText("Lire et télécharger")).toBeVisible();
  await expect(dialog.getByText("Organiser votre travail")).toBeVisible();
  await expect(dialog.getByText("Connexion et droits")).toBeVisible();
  await dialog.getByRole("button", { name: "Actualiser mes droits" }).click();
  await expect(dialog.getByText("Droits et groupes actualisés.")).toBeVisible();
  await dialog.getByRole("button", { name: "Fermer" }).click();

  await page
    .locator("header")
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await page.getByRole("button", { name: "Help" }).click();
  await expect(
    page.getByRole("dialog", { name: "ISMS help center" }),
  ).toBeVisible();
});

test("explorer exposes its active context and can reset all filters", async ({
  page,
}) => {
  await page.goto("/explorer?space=general");
  const context = page.getByLabel("Filtres actifs");
  await expect(context).toContainText("Documents généraux");
  await page.getByRole("button", { name: "Tout afficher" }).click();
  await expect(page).toHaveURL(/\/explorer$/);
  await expect(context).toHaveCount(0);
});

test("admin mobile navigation is grouped and collapsible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const navigation = page.getByRole("navigation", { name: "Administration" });
  await expect(navigation).toBeHidden();
  await page.getByRole("button", { name: "Afficher la navigation" }).click();
  await expect(navigation).toBeVisible();
  await expect(navigation.getByText("Contenu et accès")).toBeVisible();
  await navigation
    .getByRole("button", { name: "Contenu et accès", exact: true })
    .click();
  await navigation.getByRole("button", { name: /Documents$/ }).click();
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await expect(navigation).toBeHidden();
});

test("document preview and binary download work", async ({ page, request }) => {
  await page.goto("/explorer?category=policies");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await page.getByRole("button", { name: "Ouvrir" }).first().click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/documents\/[a-z0-9-]+/);
  await page.reload();
  dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".document-reader-meta")).toBeVisible();
  await expect(dialog.locator("iframe")).toBeVisible();
  const download = dialog.getByRole("link", { name: "Télécharger" });
  const href = await download.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await dialog.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/explorer$/);
  await page.waitForTimeout(250);
  await expect(dialog).toBeHidden();
});

test("category explorer supports window and list views with an expandable reader", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("header")
    .getByRole("button", { name: "FR", exact: true })
    .click();
  await page
    .locator("aside")
    .getByRole("button", { name: /Documents généraux.*sous-menus/ })
    .click();
  await page
    .locator("aside")
    .getByText("Procédures", { exact: true })
    .first()
    .click();

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

test("PDF reader provides responsive zoom and dedicated viewing controls", async ({
  page,
}) => {
  await page.goto("/explorer?space=general");
  await page
    .locator(".documents")
    .getByRole("button", { name: "Ouvrir" })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  const frame = dialog.locator("iframe");
  const toolbar = dialog.getByRole("toolbar", {
    name: "Commandes du lecteur PDF",
  });
  await expect(toolbar).toBeVisible();
  await expect(frame).toHaveAttribute("src", /zoom=page-width/);

  await toolbar.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(toolbar.getByLabel("Niveau de zoom")).toHaveText("125%");
  await expect(frame).toHaveAttribute("src", /zoom=125/);

  await toolbar
    .getByRole("button", { name: "Afficher la page entière" })
    .click();
  await expect(frame).toHaveAttribute("src", /zoom=page-fit/);
  await toolbar.getByRole("button", { name: "Ajuster à la largeur" }).click();
  await expect(frame).toHaveAttribute("src", /zoom=page-width/);
  const outline = toolbar.getByRole("button", { name: "Signets / sommaire" });
  await outline.click();
  await expect(outline).toHaveAttribute("aria-pressed", "true");
  await expect(frame).toHaveAttribute("src", /navpanes=1/);
  await expect(
    toolbar.getByRole("link", { name: "Ouvrir dans un nouvel onglet" }),
  ).toHaveAttribute("target", "_blank");
});

test("PDF reader controls are fully translated in English", async ({
  page,
}) => {
  await page.goto("/explorer?space=general");
  await page
    .locator("header")
    .getByRole("button", { name: "EN", exact: true })
    .click();
  await page
    .locator(".documents")
    .getByRole("button", { name: "Open" })
    .first()
    .click();

  const toolbar = page.getByRole("toolbar", { name: "PDF viewer controls" });
  await expect(toolbar.getByLabel("Zoom level")).toHaveText("Automatic");
  await expect(
    toolbar.getByRole("button", { name: "Fit to width" }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "Fit whole page" }),
  ).toBeVisible();
  await expect(
    toolbar.getByRole("link", { name: "Open in a new tab" }),
  ).toBeVisible();
  await expect(toolbar.getByText("Ajuster à la largeur")).toHaveCount(0);
});

test("grid and list views apply to spaces and global searches", async ({
  page,
}) => {
  await page.goto("/explorer?space=general");
  await page.getByRole("button", { name: "Affichage en fenêtres" }).click();
  await expect(page.locator(".documents")).toHaveClass(/document-grid/);

  await page.getByLabel("Trier par").selectOption("popular");
  await expect(page).toHaveURL(/sort=popular/);
  await expect(page.getByLabel("Trier par")).toHaveValue("popular");

  const search = page.getByRole("textbox", {
    name: /Rechercher une politique/,
  });
  await search.fill("VPN");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=VPN/);
  await expect(page.locator(".documents")).toHaveClass(/document-grid/);
  await expect(
    page.getByRole("heading", { name: "Résultats de recherche" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator(".documents")).toHaveClass(/document-grid/);
  await expect(
    page.getByRole("heading", { name: "Résultats de recherche" }),
  ).toBeVisible();
});

test("slash focuses the document search without affecting form fields", async ({
  page,
}) => {
  await page.goto("/explorer");
  const search = page.getByRole("textbox", {
    name: /Rechercher une politique/,
  });
  await expect(page.locator(".explorer-heading")).toBeVisible();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.type("VPN/Access");
  await expect(search).toHaveValue("VPN/Access");
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

  for (const group of ["Contenu et accès", "Infrastructure", "Système"])
    await page.getByRole("button", { name: group, exact: true }).click();

  for (const heading of [
    "Groupes Active Directory",
    "Gestion des droits d’accès",
    "Espaces documentaires",
    "Documents",
    "Demandes utilisateurs",
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
    if (heading === "Santé des services") {
      await expect(
        page.getByText(
          "Métriques Prometheus disponibles sur le réseau API privé.",
        ),
      ).toBeVisible();
      await expect(page.locator('a[href="/api/metrics"]')).toHaveCount(0);
    }
  }
});

test("document spaces provide a clear responsive content hierarchy", async ({
  page,
  request,
}) => {
  await page.goto("/admin#spaces");
  await expect(
    page.getByRole("heading", { name: "Espaces documentaires", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Résumé du contenu" }),
  ).toBeVisible();

  const spaces = page.locator(".space-management-card");
  await expect(spaces.first()).toBeVisible();
  await expect(
    spaces.first().locator(".space-management-counts"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nouvel espace" }).click();
  await expect(
    page.getByRole("heading", { name: "Créer un espace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Identifiant technique")).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();

  await spaces
    .first()
    .getByRole("button", { name: "Ajouter une catégorie" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Créer une catégorie" }),
  ).toBeVisible();
  await expect(page.getByLabel("Espace de la catégorie")).not.toHaveValue("");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await expect(
    spaces.first().locator(".space-management-header-actions"),
  ).toBeVisible();

  const suffix = Date.now().toString(36);
  const created = await request.post("/api/admin/spaces", {
    data: {
      slug: `empty-${suffix}`,
      nameFr: `Espace vide ${suffix}`,
      nameEn: `Empty space ${suffix}`,
    },
  });
  expect(created.status()).toBe(201);
  const emptySpace = (await created.json()) as { id: string };
  const deleted = await request.delete(
    `/api/admin/spaces/${emptySpace.id}/permanent`,
  );
  expect(deleted.ok()).toBe(true);
  expect(await deleted.json()).toEqual({ deleted: true });
});

test("administration is fully switchable between French and English", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Interface language" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Content and access" }).click();

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
    if (menu === "LDAP synchronization")
      await page.getByRole("button", { name: "Infrastructure" }).click();
    if (menu === "Service health")
      await page.getByRole("button", { name: "System" }).click();
    await page.getByRole("button", { name: menu, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
    if (menu === "Documents") {
      const documentLanguage = page.getByRole("group", {
        name: "Document language",
      });
      await expect(documentLanguage).toBeVisible();
      await expect(
        documentLanguage.getByRole("radio", { name: "FR" }),
      ).toBeChecked();
      await expect(
        page.getByText("Only identifies the language of the file."),
      ).toBeVisible();
    } else if (menu === "Document spaces") {
      await expect(
        page.getByRole("button", { name: "New space" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New category" }),
      ).toBeVisible();
      await expect(
        page
          .locator(".space-management-card")
          .first()
          .getByRole("button", { name: "Add category" }),
      ).toBeVisible();
    }
  }

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configuration" }),
  ).toBeVisible();
  await expect(
    page.getByText("Administrateur ISMS", { exact: true }).last(),
  ).toBeVisible();
});

test("successful asynchronous forms reset without losing their element", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const documentTitle = `Formulaire asynchrone ${suffix}`;
  const adminUsername = `reset-${suffix}`;
  const adminDisplayName = `Reset ${suffix}`;

  try {
    const spaces = (await (
      await request.get("/api/admin/spaces")
    ).json()) as Array<{ id: string; slug: string }>;
    const spaceId = spaces.find((space) => space.slug === "general")?.id;
    expect(spaceId).toBeTruthy();

    await page.goto("/admin#documents");
    const uploadForm = page.locator("form.upload-form");
    await uploadForm.locator('select[name="spaceId"]').selectOption(spaceId!);
    await uploadForm.locator('input[name="title"]').fill(documentTitle);
    await uploadForm.locator('input[name="file"]').setInputFiles({
      name: "form-reset.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
    });
    await uploadForm
      .getByRole("button", { name: "Déposer et analyser" })
      .click();
    await expect(uploadForm.locator('input[name="title"]')).toHaveValue("");
    await expect(uploadForm.locator('input[name="file"]')).toHaveValue("");

    await page.getByRole("button", { name: "Système" }).click();
    await page
      .getByRole("button", { name: "Configuration", exact: true })
      .click();
    const accountForm = page.locator("form").filter({
      has: page.getByRole("heading", {
        name: "Ajouter un administrateur local",
      }),
    });
    await accountForm
      .locator('input[name="displayName"]')
      .fill(adminDisplayName);
    await accountForm.locator('input[name="username"]').fill(adminUsername);
    await accountForm
      .locator('input[name="password"]')
      .fill(`Aa9!reset-${suffix}-Strong`);
    await accountForm
      .locator('textarea[name="justification"]')
      .fill("Functional test administrator");
    const validFrom = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    const validUntil = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    await accountForm.locator('input[name="validFrom"]').fill(validFrom);
    await accountForm.locator('input[name="validUntil"]').fill(validUntil);
    await accountForm.getByRole("button", { name: "Ajouter" }).click();
    await expect(accountForm.locator('input[name="username"]')).toHaveValue("");
    await expect(
      page
        .locator(".admin-account-list > div")
        .filter({ hasText: adminDisplayName }),
    ).toContainText(adminUsername);
    const createdAccount = (await (
      await request.get("/api/admin/accounts")
    ).json()) as Array<{
      username: string;
      validFrom: string | null;
      validUntil: string | null;
    }>;
    expect(
      createdAccount.find((item) => item.username === adminUsername),
    ).toMatchObject({
      validFrom: expect.any(String),
      validUntil: expect.any(String),
    });
  } finally {
    const accounts = (await (
      await request.get("/api/admin/accounts")
    ).json()) as Array<{ id: string; username: string; primary: boolean }>;
    const account = accounts.find(
      (candidate) => candidate.username === adminUsername,
    );
    if (account && !account.primary)
      expect(
        (await request.delete(`/api/admin/accounts/${account.id}`)).ok(),
      ).toBeTruthy();

    const documents = (await (
      await request.get("/api/admin/documents")
    ).json()) as Array<{
      id: string;
      translations: Array<{ title: string }>;
    }>;
    const document = documents.find((candidate) =>
      candidate.translations.some(
        (translation) => translation.title === documentTitle,
      ),
    );
    if (document)
      expect(
        (await request.delete(`/api/admin/documents/${document.id}`)).ok(),
      ).toBeTruthy();
  }
});

test("administration uses accessible confirmations and edits an existing directory connector", async ({
  page,
}) => {
  await page.route("**/api/admin/access-rules", async (route) => {
    await route.fulfill({
      json: [
        {
          id: "rule-confirmation-test",
          groupId: "group-confirmation-test",
          spaceId: "space-confirmation-test",
          group: { id: "group-confirmation-test", name: "Confirmation test" },
          space: {
            id: "space-confirmation-test",
            slug: "confirmation-test",
            nameFr: "Test de confirmation",
            nameEn: "Confirmation test",
          },
          showMenu: true,
          read: true,
          search: true,
          preview: true,
          download: false,
          upload: false,
          edit: false,
          publish: false,
          archive: false,
        },
      ],
    });
  });
  await page.goto("/admin#rules");
  await expect(
    page.getByRole("heading", { name: "Gestion des droits d’accès" }),
  ).toBeVisible();
  await expect(page.locator(".drawer")).toBeHidden();
  await page.getByRole("button", { name: "Ajouter une règle" }).click();
  await expect(page.locator(".drawer")).toBeVisible();
  await expect(page.locator(".drawer select").first()).toBeFocused();
  await page
    .locator(".drawer")
    .getByRole("button", { name: "Annuler" })
    .click();
  await expect(page.locator(".drawer")).toBeHidden();
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
    loginAttribute: "sAMAccountName",
    groupAttribute: "cn",
    emailAttribute: "mail",
    nestedGroups: true,
    syncIntervalMinutes: 60,
    timeoutMs: 5000,
    retries: 2,
    enabled: true,
    caCertificateId: null,
    lastTestStatus: null,
    syncJobs: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        status: "SUCCESS",
        details: { groups: 1, selectedGroups: 1 },
        startedAt: "2026-07-31T08:28:37.582Z",
        finishedAt: "2026-07-31T08:28:44.530Z",
      },
    ],
  };
  await page.route("**/api/admin/directory-connections", async (route) => {
    await route.fulfill({ json: [connection] });
  });
  await page.route(
    `**/api/admin/directory-connections/${connection.id}`,
    async (route) => {
      if (route.request().method() === "DELETE") {
        connection.enabled = false;
        await route.fulfill({ json: { disabled: true } });
        return;
      }
      expect(route.request().method()).toBe("PUT");
      const payload = route.request().postDataJSON() as {
        name: string;
        bindSecret?: string;
        enabled: boolean;
      };
      expect(payload.name).toBe(connection.name);
      expect(payload.bindSecret).toBe("");
      expect(payload.enabled).toBe(true);
      await route.fulfill({ json: connection });
    },
  );

  await page.getByRole("button", { name: "Actualiser" }).click();
  await page
    .locator("aside")
    .getByRole("button", { name: "Infrastructure" })
    .click();
  await page
    .locator("aside")
    .getByRole("button", { name: "Synchronisation LDAP" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Synchronisation LDAP/LDAPS" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 groupe(s) sélectionné(s) actualisé(s)."),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: connection.name })
    .locator("..")
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

  await page
    .getByRole("heading", { name: connection.name })
    .locator("..")
    .getByRole("button", { name: "Désactiver" })
    .click();
  await expect(
    page.getByText(
      `Le connecteur ${connection.name} est désactivé. Les synchronisations automatiques et les connexions LDAP sont arrêtées.`,
    ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: connection.name })
      .locator("..")
      .getByText("Inactif"),
  ).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: connection.name })
      .locator("..")
      .getByRole("button", { name: "Désactiver" }),
  ).toBeDisabled();
});

test("an administrator can confirm purging synchronized AD data", async ({
  page,
}) => {
  let purgeCalled = false;
  await page.route(
    "**/api/admin/directory-connections/purge",
    async (route) => {
      purgeCalled = true;
      expect(route.request().method()).toBe("POST");
      await route.fulfill({ json: { groups: 12, rules: 3 } });
    },
  );
  await page.goto("/admin#directory");
  await page.getByRole("button", { name: "Purger les données AD" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText(
    "Cette action ne modifie pas Active Directory",
  );
  await confirmation.getByRole("button", { name: "Confirmer" }).click();
  await expect(
    page.getByText("Purge terminée : 12 groupe(s) et 3 règle(s) supprimé(s)."),
  ).toBeVisible();
  expect(purgeCalled).toBe(true);
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

test("an administrator can search and select a live AD group", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1048, height: 762 });
  const distinguishedName = "CN=SkillsRDP,OU=Groups,DC=example,DC=com";
  let importedBody: Record<string, string> | undefined;
  await page.route(
    "**/api/admin/directory-connections/groups/search?*",
    async (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([
          {
            connectionId: "11111111-1111-4111-8111-111111111111",
            connectionName: "DC04",
            name: "HYBRID_NO_LICENCE_M365BusinessPremium",
            distinguishedName:
              "CN=HYBRID_NO_LICENCE_M365BusinessPremium,OU=Groupes de sécurité,OU=Groupes d'accès,DC=example,DC=com",
            description: "Long group name used to validate responsive wrapping",
            memberCount: 5,
          },
          {
            connectionId: "11111111-1111-4111-8111-111111111111",
            connectionName: "DC04",
            name: "SkillsRDP",
            distinguishedName,
            description: "Remote desktop access",
            memberCount: 4,
          },
        ]),
      }),
  );
  await page.route("**/api/admin/groups/import", async (route) => {
    importedBody = route.request().postDataJSON() as Record<string, string>;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ id: "imported-skills-rdp" }),
    });
  });

  await page.goto("/admin#groups");
  for (const language of ["FR", "EN"]) {
    const bounds = await page
      .locator(".admin-language")
      .getByRole("button", { name: language, exact: true })
      .boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(40);
  }
  const picker = page.getByRole("textbox", {
    name: "Rechercher ou saisir le DN du groupe AD",
  });
  await picker.fill("Skill");
  const suggestions = page.getByRole("listbox", {
    name: "Groupes trouvés dans Active Directory",
  });
  await expect(suggestions).toBeVisible();
  expect(
    await suggestions.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        wideEnough: bounds.width >= 360,
        insideViewport: bounds.left >= 0 && bounds.right <= window.innerWidth,
        noHorizontalOverflow: element.scrollWidth <= element.clientWidth,
      };
    }),
  ).toEqual({
    wideEnough: true,
    insideViewport: true,
    noHorizontalOverflow: true,
  });
  const suggestion = page.getByRole("option", { name: /SkillsRDP/ });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(page.getByLabel("Nom du groupe AD")).toHaveValue("SkillsRDP");
  await expect(
    page.getByText(`Sélection AD : ${distinguishedName}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(
    page.getByText("Groupe importé depuis Active Directory."),
  ).toBeVisible();
  expect(importedBody).toEqual({
    connectionId: "11111111-1111-4111-8111-111111111111",
    distinguishedName,
  });
});

test("admin deep links stay synchronized with browser navigation", async ({
  page,
}) => {
  await page.goto("/admin#dashboard");
  await expect(
    page.getByRole("heading", { name: "Tableau de bord" }),
  ).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = "groups";
  });
  await expect(
    page.getByRole("heading", { name: "Groupes Active Directory" }),
  ).toBeVisible();

  await page.evaluate(() => {
    window.location.hash = "spaces";
  });
  await expect(
    page.getByRole("heading", { name: "Espaces documentaires" }),
  ).toBeVisible();

  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Groupes Active Directory" }),
  ).toBeVisible();
});

test("annual incident reports can be published and read without write actions", async ({
  page,
  request,
}) => {
  const year = 2098;
  const existing = (await (
    await request.get("/api/admin/incident-reports")
  ).json()) as Array<{ id: string; year: number }>;
  for (const report of existing.filter((item) => item.year === year))
    await request.delete(`/api/admin/incident-reports/${report.id}`);

  await page.goto("/admin#incidents");
  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rapports d’incidents annuels" }),
  ).toBeVisible();
  await page.getByLabel("Année").fill(String(year));
  await page.getByLabel("Incidents totaux").fill("12");
  await page.getByLabel("Incidents critiques").fill("2");
  await page.getByLabel("Incidents résolus").fill("10");
  await page
    .getByLabel("Synthèse annuelle")
    .fill("Synthèse fonctionnelle des incidents de sécurité.");
  await page
    .getByLabel("Enseignements et actions d’amélioration")
    .fill("Renforcer les exercices et le suivi des actions.");
  await page.getByRole("button", { name: "Enregistrer le rapport" }).click();
  await expect(page.getByText("Rapport annuel créé.")).toBeVisible();
  const card = page.locator(".incident-report-card", {
    has: page.getByRole("heading", { name: String(year) }),
  });
  await expect(card.getByText("83%")).toBeVisible();

  await card.getByRole("button", { name: "Modifier" }).click();
  await page.getByLabel("Incidents résolus").fill("12");
  await page.getByLabel("Statut").selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Enregistrer le rapport" }).click();
  await expect(page.getByText("Rapport annuel mis à jour.")).toBeVisible();
  await expect(card.getByText("100%")).toBeVisible();
  await expect(card.getByText("Publié")).toBeVisible();

  await page.goto("/incident-reports");
  await expect(
    page.getByRole("heading", { name: "Rapports annuels d’incidents" }),
  ).toBeVisible();
  const publishedReport = page.locator(".published-incident-report", {
    has: page.getByRole("heading", { name: String(year) }),
  });
  await expect(publishedReport).toBeVisible();
  await expect(publishedReport.getByText("100%")).toBeVisible();
  await expect(
    publishedReport.getByText("Consultation en lecture seule"),
  ).toBeVisible();
  await expect(publishedReport.getByRole("button")).toHaveCount(0);
  await publishedReport
    .getByText("Afficher la synthèse et les enseignements")
    .click();
  await expect(
    publishedReport.getByText(
      "Synthèse fonctionnelle des incidents de sécurité.",
    ),
  ).toBeVisible();
  await expect(
    page
      .getByLabel("Rapports annuels d’incidents")
      .getByText("Années publiées"),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(
    publishedReport.locator('strong[data-label="Incidents totaux"]'),
  ).toBeVisible();

  await page.goto("/admin#incidents");
  const adminCard = page.locator(".incident-report-card", {
    has: page.getByRole("heading", { name: String(year) }),
  });

  await adminCard.getByRole("button", { name: "Supprimer" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmer", exact: true })
    .click();
  await expect(page.getByText("Rapport annuel supprimé.")).toBeVisible();
  await expect(adminCard).toHaveCount(0);
});

test("portal and administration remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
  await expect(page.locator("aside nav")).toBeVisible();
  await page.locator("aside .space-menu[aria-controls]").first().click();
  await page
    .locator("aside .category-submenu")
    .first()
    .getByRole("button", { name: "Procédures", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/explorer\?.*category=[a-z0-9-]+/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto("/admin");
  await expect(page.locator(".admin-shell > aside")).toBeVisible();
  await page.getByRole("button", { name: "Afficher la navigation" }).click();
  await page
    .getByRole("navigation", { name: "Administration" })
    .getByRole("button", { name: "Contenu et accès", exact: true })
    .click();
  await page.locator("aside").getByText("Documents", { exact: true }).click();
  await expect(page).toHaveURL(/#documents/);
  const firstDocumentCell = page.locator(".admin-table-wrap tbody td").first();
  await expect(firstDocumentCell).toHaveAttribute("data-label", /.+/);
  await expect(firstDocumentCell).toHaveCSS("display", "grid");
  const shortTouchTargets = await page
    .locator("button:visible")
    .evaluateAll(
      (buttons) =>
        buttons.filter((button) => button.getBoundingClientRect().height < 44)
          .length,
    );
  expect(shortTouchTargets).toBe(0);
  await expect(page.locator(".version-footer")).toHaveCSS(
    "position",
    "relative",
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("menu navigation keeps the authenticated page visible while data refreshes", async ({
  page,
}) => {
  await page.goto("/explorer");
  const visibleDocument = page.locator(".document").first();
  await expect(visibleDocument).toBeVisible();

  await page.route("**/api/documents?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.locator("aside .space-menu[aria-controls]").first().click();
  await page
    .locator("aside .category-submenu")
    .first()
    .getByRole("button")
    .first()
    .click();

  await expect(page.locator(".loading-state")).toHaveCount(0);
  await expect(visibleDocument).toBeVisible();
  await expect(page.locator(".explorer-heading")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator(".explorer-heading")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("cross-page menu navigation reuses the authenticated session without loading text", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".shell")).toBeVisible();
  await page.route("**/api/documents?**", async (route) => {
    if (!route.request().url().includes("favorites=true")) {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.getByRole("button", { name: "Mes favoris" }).click();
  await expect(page).toHaveURL(/\/explorer\?favorites=true/);
  await expect(page.locator(".loading-state")).toHaveCount(0);
  await expect(page.locator(".shell")).toBeVisible();
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
  expect((await request.get("/api/admin/access-rule-templates")).status()).toBe(
    404,
  );
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
    const ruleTemplate = {
      showMenu: true,
      read: true,
      search: true,
      preview: true,
      download: false,
      upload: false,
      edit: false,
      publish: false,
      archive: false,
    };
    const unknownGroupResponse = await request.post("/api/admin/access-rules", {
      data: {
        ...ruleTemplate,
        groupId: "11111111-1111-4111-8111-111111111111",
        spaceId: spaces[0].id,
      },
    });
    expect(unknownGroupResponse.status()).toBe(400);
    const unknownSpaceResponse = await request.post("/api/admin/access-rules", {
      data: {
        ...ruleTemplate,
        groupId: group.id,
        spaceId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(unknownSpaceResponse.status()).toBe(400);

    const createdResponse = await request.post("/api/admin/access-rules", {
      data: {
        ...ruleTemplate,
        groupId: group.id,
        spaceId: spaces[0].id,
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

test("observability center proposes private integrations without exposing metrics", async ({
  page,
}) => {
  await page.goto("/admin#observability");
  await expect(
    page.getByRole("heading", { name: "Observabilité", exact: true }),
  ).toBeVisible();
  for (const integration of [
    "Prometheus / Grafana",
    "Syslog / rsyslog",
    "Wazuh",
    "Zabbix",
  ])
    await expect(
      page.getByRole("heading", { name: integration }),
    ).toBeVisible();
  await expect(page.getByText(/réseau privé de l’API/)).toBeVisible();
  await expect(page.locator('a[href="/api/metrics"]')).toHaveCount(0);
  await expect(page.getByText(/isms-portal_observability/)).toBeVisible();
  await expect(
    page.getByText("Adresse du portail détectée automatiquement", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(new URL(page.url()).origin).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Activer cette intégration optionnelle").first(),
  ).toBeVisible();
});

test("governance workflows support lifetime access, reviews, SoA, retention, identity, CAPA and private views", async ({
  page,
  request,
}) => {
  const governanceRun = Date.now().toString(36).toUpperCase();
  const documents = (await (
    await request.get("/api/admin/documents")
  ).json()) as Array<{ id: string }>;
  const rules = (await (
    await request.get("/api/admin/access-rules")
  ).json()) as Array<{ id: string }>;
  expect(documents.length).toBeGreaterThan(0);
  expect(rules.length).toBeGreaterThan(0);
  const documentId = documents[0].id;

  const certification = await request.put(
    `/api/admin/governance/access-certifications/${rules[0].id}`,
    {
      data: {
        lifetime: true,
        justification: "Accès permanent validé par la recette",
      },
    },
  );
  expect(certification.ok()).toBeTruthy();
  expect(await certification.json()).toMatchObject({
    lifetime: true,
    validUntil: null,
    certificationDueAt: null,
  });
  const temporaryExpiry = new Date(Date.now() + 365 * 86400000).toISOString();
  const temporaryCertification = await request.put(
    `/api/admin/governance/access-certifications/${rules[0].id}`,
    {
      data: {
        lifetime: false,
        validUntil: temporaryExpiry,
        certificationDueAt: temporaryExpiry,
        justification: "Accès temporaire validé par la recette",
      },
    },
  );
  expect(temporaryCertification.ok()).toBeTruthy();
  expect(await temporaryCertification.json()).toMatchObject({
    lifetime: false,
    validUntil: temporaryExpiry,
  });

  const review = await request.post("/api/admin/governance/reviews", {
    data: {
      documentId,
      owner: "proprietaire@example.test",
      reviewer: "relecteur@example.test",
      approver: "approbateur@example.test",
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  expect(review.status(), await review.text()).toBe(201);
  expect(await review.json()).toMatchObject({ versionId: expect.any(String) });

  const control = await request.post("/api/admin/governance/controls", {
    data: {
      framework: "ISO 27001",
      reference: `A.5.${governanceRun}`,
      title: "Contrôle de recette gouvernance",
      applicability: "APPLICABLE",
      implementationStatus: "IMPLEMENTED",
      owner: "RSSI",
      justification: "Preuve liée au document de recette",
      evidenceDocumentId: documentId,
    },
  });
  expect(control.status()).toBe(201);

  const adminIdentity = (await (
    await request.get("/api/admin/check")
  ).json()) as { username: string };
  const exception = await request.post(
    "/api/admin/governance/risk-exceptions",
    {
      data: {
        title: `Dérogation ${governanceRun}`,
        owner: "metier@example.test",
        approver: adminIdentity.username,
        justification: "Exception temporaire nécessaire pour la recette.",
        compensatingControl: "Surveillance renforcée et revue hebdomadaire.",
        expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    },
  );
  expect(exception.status()).toBe(201);
  const exceptionBody = (await exception.json()) as { id: string };
  expect(
    (
      await request.put(
        `/api/admin/governance/risk-exceptions/${exceptionBody.id}/decision`,
        { data: { status: "APPROVED" } },
      )
    ).ok(),
  ).toBeTruthy();
  const kpi = await request.get("/api/admin/governance/kpi");
  expect(kpi.ok()).toBeTruthy();
  expect(await kpi.json()).toMatchObject({
    documents: {
      total: expect.any(Number),
      publicationRate: expect.any(Number),
    },
    controls: { implementationRate: expect.any(Number) },
    incidents: { resolutionRate: expect.any(Number) },
  });

  const retention = await request.put("/api/admin/governance/retention", {
    data: {
      documentId,
      legalHold: true,
      reason: "Gel réglementaire de recette",
    },
  });
  expect(retention.ok()).toBeTruthy();
  const retentionBody = (await retention.json()) as { id: string };
  expect(
    (
      await request.put(
        `/api/admin/governance/retention/${retentionBody.id}/destruction`,
        { data: { action: "REQUEST", reason: "Tentative interdite" } },
      )
    ).status(),
  ).toBe(409);

  const incident = await request.post("/api/admin/governance/incidents", {
    data: {
      reference: `INC-E2E-${governanceRun}`,
      title: "Incident de recette gouvernance",
      severity: "HIGH",
      status: "OPEN",
      owner: "SOC",
      occurredAt: new Date().toISOString(),
    },
  });
  expect(incident.status()).toBe(201);
  const incidentBody = (await incident.json()) as { id: string };
  expect(
    (
      await request.post(
        `/api/admin/governance/incidents/${incidentBody.id}/actions`,
        {
          data: {
            description: "Corriger la cause racine",
            owner: "SOC",
            dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            status: "OPEN",
          },
        },
      )
    ).status(),
  ).toBe(201);
  const preview = await request.post("/api/admin/governance/bulk/preview", {
    data: {
      kind: "INCIDENT_STATUS",
      ids: [incidentBody.id],
      value: "INVESTIGATING",
    },
  });
  expect(await preview.json()).toMatchObject({ count: 1 });
  expect(
    (
      await request.post("/api/admin/governance/bulk/apply", {
        data: {
          kind: "INCIDENT_STATUS",
          ids: [incidentBody.id],
          value: "INVESTIGATING",
          confirmed: true,
        },
      })
    ).ok(),
  ).toBeTruthy();

  const savedView = await request.post("/api/admin/governance/saved-views", {
    data: {
      section: "incidents",
      name: "Incidents en enquête",
      config: { status: "INVESTIGATING" },
    },
  });
  expect(savedView.status()).toBe(201);
  expect(
    (
      await request.delete(
        "/api/admin/governance/saved-views/00000000-0000-4000-8000-000000000099",
      )
    ).status(),
  ).toBe(404);

  const health = await request.get(
    "/api/admin/governance/identity-health?dormantDays=90",
  );
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({ dormantDays: 90 });

  await page.route("**/api/admin/accounts/directory-users/*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          username: "alice.ad",
          displayName: "Alice Annuaire",
          email: "alice@example.test",
        },
        {
          username: "bob.ad",
          displayName: "Bob Annuaire",
          email: "bob@example.test",
        },
      ]),
    });
  });
  await page.goto("/admin#governance");
  await expect(
    page.getByRole("heading", { name: "Gouvernance ISMS" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Accès lifetime/ })).toBeVisible();
  const ownerPicker = page.getByRole("group", { name: "Propriétaire" });
  await ownerPicker.getByLabel("Rechercher dans l’annuaire").fill("alice");
  await ownerPicker.getByRole("button", { name: /Alice Annuaire/ }).click();
  await expect(
    ownerPicker.getByText("Utilisateur AD sélectionné"),
  ).toBeVisible();

  const reviewerPicker = page.getByRole("group", { name: "Relecteur" });
  await reviewerPicker.getByRole("button", { name: "Saisie manuelle" }).click();
  await reviewerPicker
    .getByLabel("Nom ou identifiant manuel")
    .fill("prestataire@example.test");

  const approverPicker = page.getByRole("group", { name: "Approbateur" });
  await approverPicker.getByLabel("Rechercher dans l’annuaire").fill("bob");
  await approverPicker.getByRole("button", { name: /Bob Annuaire/ }).click();
  const reviewForm = page
    .getByRole("heading", { name: "Planifier une revue" })
    .locator("..");
  await reviewForm.getByLabel("Document").selectOption({ index: 1 });
  await reviewForm
    .getByLabel("Échéance")
    .fill(new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 16));
  await expect(
    reviewForm.getByRole("button", { name: "Créer la revue" }),
  ).toBeEnabled();
  await reviewForm.getByRole("button", { name: "Créer la revue" }).click();
  await expect(
    page.getByText("alice.ad → prestataire@example.test → bob.ad"),
  ).toBeVisible();
  const createdReview = page
    .locator(".governance-card")
    .filter({ hasText: "alice.ad → prestataire@example.test → bob.ad" });
  await createdReview.getByRole("button", { name: "Approuver" }).click();
  const decisionDialog = page.getByRole("dialog", {
    name: "Justifier l’approbation",
  });
  await expect(
    decisionDialog.getByRole("button", { name: "Confirmer l’approbation" }),
  ).toBeDisabled();
  await decisionDialog
    .getByLabel("Commentaire de décision")
    .fill("Contenu relu, preuves contrôlées et version validée.");
  await decisionDialog
    .getByRole("button", { name: "Confirmer l’approbation" })
    .click();
  await expect(createdReview.getByText("Preuve de décision")).toBeVisible();
  await expect(
    createdReview.getByText(
      "Contenu relu, preuves contrôlées et version validée.",
    ),
  ).toBeVisible();
  const publicDocuments = (await (
    await request.get("/api/documents")
  ).json()) as Array<{
    reviews: Array<{
      owner: string;
      reviewer: string;
      approver: string;
      decisionComment: string;
      version: { version: number } | null;
    }>;
  }>;
  const publicEvidence = publicDocuments
    .flatMap((document) => document.reviews)
    .find(
      (item) =>
        item.decisionComment ===
        "Contenu relu, preuves contrôlées et version validée.",
    );
  expect(publicEvidence).toMatchObject({
    owner: "alice.ad",
    reviewer: "prestataire@example.test",
    approver: "bob.ad",
    version: { version: expect.any(Number) },
  });
  await createdReview
    .getByRole("button", { name: "Planifier la prochaine revue dans un an" })
    .click();
  await expect(reviewForm.getByLabel("Document")).not.toHaveValue("");
  await expect(reviewForm.getByLabel("Échéance")).not.toHaveValue("");

  const reviewsTab = page.getByRole("tab", { name: /Revues/ });
  await reviewsTab.focus();
  await reviewsTab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Accès lifetime/ })).toBeFocused();
  await expect(
    page.getByRole("tabpanel", { name: /Accès lifetime/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /Santé identité/ }).click();
  await expect(
    page.getByRole("heading", { name: "État des connecteurs" }),
  ).toBeVisible();
  await expect(page.locator(".health-json")).toHaveCount(0);

  await page.route("**/api/admin/governance/summary", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page
    .locator(".governance-panel")
    .getByRole("button", { name: "Actualiser", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "État des connecteurs" }),
  ).toBeVisible();
  await expect(page.locator(".admin-skeleton")).toHaveCount(0);
  await expect(page.getByText("Actualisation en arrière-plan…")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("personal tools persist searches, preferences, access requests and reports", async ({
  page,
  request,
}) => {
  const documentsResponse = await request.get("/api/documents?limit=10");
  expect(documentsResponse.ok()).toBeTruthy();
  const documents = (await documentsResponse.json()) as Array<{
    id: string;
    space: { id: string };
    versions: Array<{ id: string; version: number }>;
  }>;
  expect(documents.length).toBeGreaterThan(0);
  const document = documents[0];

  expect(
    (
      await request.post("/api/user-tools/saved-searches", {
        data: {
          name: "Contrôle VPN",
          filters: { q: "VPN", format: "pdf", forbidden: "ignored" },
        },
      })
    ).ok(),
  ).toBeTruthy();
  const searchesResponse = await request.get("/api/user-tools/saved-searches");
  const searches = (await searchesResponse.json()) as Array<{
    id: string;
    filters: Record<string, string>;
  }>;
  expect(searches[0].filters).toMatchObject({ q: "VPN", format: "pdf" });
  expect(searches[0].filters).not.toHaveProperty("forbidden");

  expect(
    (
      await request.put("/api/user-tools/preferences", {
        data: { locale: "fr", viewMode: "grid", density: "compact" },
      })
    ).ok(),
  ).toBeTruthy();
  const identity = (await (await request.get("/api/me")).json()) as {
    preferences: { viewMode: string; density: string };
  };
  expect(identity.preferences).toMatchObject({
    viewMode: "grid",
    density: "compact",
    textScale: 100,
    highContrast: false,
    reducedMotion: false,
  });

  const securityReport = await request.post(
    "/api/user-tools/security-reports",
    {
      data: {
        category: "PHISHING",
        urgency: "HIGH",
        description: "Courriel suspect reçu pendant la recette fonctionnelle.",
      },
    },
  );
  expect(securityReport.status()).toBe(201);
  expect(await securityReport.json()).toMatchObject({
    reference: expect.stringMatching(/^SEC-/),
    status: "OPEN",
  });
  const securityReportWithAttachment = await request.post(
    "/api/user-tools/security-reports",
    {
      multipart: {
        category: "INCIDENT",
        urgency: "MEDIUM",
        description: "Pièce justificative analysée pendant la recette.",
        attachment: {
          name: "evidence.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n% secure evidence\n"),
        },
      },
    },
  );
  expect(securityReportWithAttachment.status()).toBe(201);
  expect(document.versions.length).toBeGreaterThan(0);
  const acknowledgement = await request.post(
    "/api/user-tools/acknowledgements",
    {
      data: {
        documentId: document.id,
        versionId: document.versions[0].id,
      },
    },
  );
  expect(acknowledgement.status()).toBe(201);
  expect(await acknowledgement.json()).toMatchObject({
    documentId: document.id,
    versionId: document.versions[0].id,
    sha256: expect.any(String),
  });

  const accessRequestResponse = await request.post(
    "/api/user-tools/access-requests",
    {
      data: {
        spaceId: document.space.id,
        documentId: document.id,
        justification: "Besoin de vérifier la procédure annuelle",
      },
    },
  );
  expect([200, 201, 400, 409]).toContain(accessRequestResponse.status());
  expect(
    (
      await request.post("/api/user-tools/document-reports", {
        data: {
          documentId: document.id,
          reason: "OUTDATED",
          message: "Contrôle fonctionnel",
        },
      })
    ).ok(),
  ).toBeTruthy();
  const workItems = (await (
    await request.get("/api/admin/operations/work-items")
  ).json()) as {
    accessRequests: unknown[];
    reports: unknown[];
    securityReports: Array<{ id: string; attachmentOriginalName?: string }>;
  };
  expect(workItems.accessRequests.length).toBeGreaterThan(0);
  expect(workItems.reports.length).toBeGreaterThan(0);
  const attachmentReport = workItems.securityReports.find(
    (item) => item.attachmentOriginalName === "evidence.pdf",
  );
  expect(attachmentReport).toBeTruthy();
  expect(
    (
      await request.get(
        `/api/admin/operations/security-reports/${attachmentReport!.id}/attachment`,
      )
    ).ok(),
  ).toBeTruthy();

  await page.goto("/admin#requests");
  await expect(
    page.getByRole("heading", { name: "Demandes utilisateurs", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Besoin de vérifier la procédure annuelle"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approuver" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approuver" }).first().click();
  await expect(
    page.getByText("Besoin de vérifier la procédure annuelle"),
  ).toHaveCount(0);
  const decidedRequests = (await (
    await request.get("/api/user-tools/access-requests")
  ).json()) as Array<{
    justification: string;
    status: string;
    requestedUntil: string;
  }>;
  expect(
    decidedRequests.find(
      (item) =>
        item.justification === "Besoin de vérifier la procédure annuelle",
    ),
  ).toMatchObject({ status: "APPROVED", requestedUntil: expect.any(String) });

  await page.goto("/explorer?q=VPN");
  await page.locator(".account-button").click();
  const workspaceTrigger = page.getByRole("button", {
    name: /Mon espace personnel/,
  });
  await workspaceTrigger.click();
  const closeWorkspace = page.getByRole("button", {
    name: "Fermer mon espace",
  });
  await expect(
    page.getByRole("button", { name: "Fermer", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(closeWorkspace).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Mon espace personnel" }),
  ).toHaveCount(0);
  await expect(page.locator(".account-button")).toBeFocused();
  await page.locator(".account-button").click();
  await page.getByRole("button", { name: /Mon espace personnel/ }).click();
  await expect(
    page.getByRole("heading", { name: "Mon espace personnel" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Recherches/ }).click();
  await expect(page.getByText("Contrôle VPN")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = page.getByRole("dialog", { name: "Mon espace personnel" });
  await expect(workspace).toBeVisible();
  await workspace.getByRole("button", { name: /Demandes/ }).click();
  await expect(workspace.getByText("Approuvée", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: /Recherches/ }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await workspace.getByRole("button", { name: "Affichage" }).click();
  await expect(workspace.locator(".personal-tools-grid")).toHaveCount(0);
  expect(
    await workspace.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).not.toBe("rgb(255, 255, 255)");
  await workspace.getByRole("button", { name: /Recherches/ }).click();
  const personalColors = await workspace.evaluate((element) => {
    const section = element.querySelector<HTMLElement>(
      ".personal-tools-grid > section",
    );
    const item = element.querySelector<HTMLElement>(".personal-tools-grid li");
    const tab = element.querySelector<HTMLElement>(
      ".personal-tools-tabs button:not(.active)",
    );
    return [section, item, tab].map((node) =>
      node ? getComputedStyle(node).backgroundColor : null,
    );
  });
  expect(personalColors[0]).toBe("rgb(255, 255, 255)");
  expect(personalColors[1]).toBe("rgb(248, 251, 255)");
  expect(personalColors[2]).not.toBe("rgb(5, 7, 11)");
  expect(new Set(personalColors.filter(Boolean)).size).toBeGreaterThan(1);
  const deleteButton = workspace.getByRole("button", { name: "Supprimer" });
  await expect(deleteButton).toBeVisible();
  const deleteButtonBox = await deleteButton.boundingBox();
  expect(deleteButtonBox).not.toBeNull();
  expect(deleteButtonBox!.height).toBeGreaterThanOrEqual(42);
  expect(deleteButtonBox!.width).toBeGreaterThan(300);
  await expect(
    workspace.getByRole("button", { name: "Fermer mon espace" }),
  ).toBeVisible();

  expect((await request.delete("/api/user-tools/recent")).ok()).toBeTruthy();
  expect(await (await request.get("/api/user-tools/recent")).json()).toEqual(
    [],
  );

  expect(
    (
      await request.delete(`/api/user-tools/saved-searches/${searches[0].id}`)
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await request.put("/api/user-tools/preferences", {
        data: { locale: "fr", viewMode: "list", density: "comfortable" },
      })
    ).ok(),
  ).toBeTruthy();
});

test("a user can report a document from the accessible form", async ({
  page,
  request,
}) => {
  const previousItems = (await (
    await request.get("/api/admin/operations/work-items")
  ).json()) as { reports: Array<{ id: string; message: string | null }> };
  for (const previous of previousItems.reports.filter(
    (item) =>
      item.message ===
      "Le numéro de version indiqué dans le document est incorrect.",
  ))
    await request.delete(
      `/api/admin/operations/document-reports/${previous.id}`,
    );
  await page.goto("/explorer");
  await page.getByRole("button", { name: "Ouvrir" }).first().click();
  await page.getByRole("button", { name: "Signaler un problème" }).click();
  const dialog = page.getByRole("dialog", { name: "Signaler un problème" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Type de problème").selectOption("INCORRECT");
  await dialog
    .getByLabel("Commentaire")
    .fill("Le numéro de version indiqué dans le document est incorrect.");
  await dialog.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Signalement envoyé à l’équipe ISMS."),
  ).toBeVisible();

  const workItems = (await (
    await request.get("/api/admin/operations/work-items")
  ).json()) as {
    reports: Array<{
      id: string;
      reason: string;
      message: string | null;
    }>;
  };
  const created = workItems.reports.find(
    (item) =>
      item.reason === "INCORRECT" &&
      item.message ===
        "Le numéro de version indiqué dans le document est incorrect.",
  );
  expect(created).toBeTruthy();

  await page.goto("/admin#requests");
  const adminReport = page
    .locator(".request-work-card")
    .filter({
      hasText: "Le numéro de version indiqué dans le document est incorrect.",
    })
    .first();
  await expect(adminReport).toBeVisible();
  await adminReport
    .getByLabel("Commentaire de résolution")
    .fill("Version contrôlée et information corrigée.");
  await adminReport
    .getByRole("button", { name: "Résoudre avec ce commentaire" })
    .click();
  await expect(adminReport.getByText("Traité", { exact: true })).toBeVisible();
  await expect(
    adminReport.getByText("Version contrôlée et information corrigée."),
  ).toBeVisible();

  const personalReports = (await (
    await request.get("/api/user-tools/document-reports")
  ).json()) as Array<{
    id: string;
    status: string;
    resolutionComment: string | null;
  }>;
  expect(personalReports).toContainEqual(
    expect.objectContaining({
      id: created!.id,
      status: "RESOLVED",
      resolutionComment: "Version contrôlée et information corrigée.",
    }),
  );

  await page.goto("/explorer");
  await page.locator(".account-button").click();
  await page.getByRole("button", { name: /Mon espace personnel/ }).click();
  const workspace = page.getByRole("dialog", { name: "Mon espace personnel" });
  await workspace.getByRole("button", { name: /Signalements/ }).click();
  await expect(
    workspace.getByText("Version contrôlée et information corrigée.").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  expect(
    (
      await request.delete(
        `/api/admin/operations/document-reports/${created!.id}`,
      )
    ).ok(),
  ).toBeTruthy();
});

test("public and administration routes respond and document capabilities are explicit", async ({
  page,
  request,
}) => {
  await page.waitForTimeout(2_000);
  const routes: Array<[string, number]> = [
    ["/api/health/live", 200],
    ["/api/health/ready", 200],
    ["/api/health/details", 200],
    ["/api/metrics", 404],
    ["/api/me", 200],
    ["/api/documents", 200],
    ["/api/admin/check", 200],
    ["/api/admin/dashboard", 200],
    ["/api/admin/groups", 200],
    ["/api/admin/access-rules", 200],
    ["/api/admin/spaces", 200],
    ["/api/admin/documents", 200],
    ["/api/admin/directory-connections", 200],
    ["/api/admin/certificates", 200],
    ["/api/admin/audit", 200],
    ["/api/admin/settings", 200],
  ];
  for (const [route, expectedStatus] of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(expectedStatus);
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
  expect(documents[0].permissions).toEqual({
    preview: true,
    download: true,
    upload: true,
    edit: true,
    archive: true,
    publish: true,
  });
  expect(
    (await request.get(`/api/documents/${documents[0].id}`)).status(),
  ).toBe(200);
  const contentResponse = await request.get(
    `/api/documents/${documents[0].id}/content?locale=fr`,
  );
  expect(contentResponse.status()).toBe(200);
  expect(contentResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(contentResponse.headers()["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'self';",
  );
  expect(
    (
      await request.get(`/api/documents/${documents[0].id}/download?locale=fr`)
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/documents/not-a-document")).status()).toBe(
    404,
  );
});

test("the edge exposes one strict policy and compresses immutable assets", async ({
  request,
}) => {
  const healthResponse = await request.get("/api/health/ready");
  expect(healthResponse.status()).toBe(200);
  const healthHeaders = healthResponse.headers();
  expect(healthHeaders["x-frame-options"]).toBe("DENY");
  expect(healthHeaders["x-content-type-options"]).toBe("nosniff");
  expect(healthHeaders["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(healthHeaders["content-security-policy"]).not.toContain(
    "unsafe-inline",
  );

  const homeResponse = await request.get("/");
  const assetPath = (await homeResponse.text()).match(
    /\/_next\/static\/[^"' ]+\.js/,
  )?.[0];
  expect(assetPath).toBeTruthy();
  const assetResponse = await request.get(assetPath!, {
    headers: { "Accept-Encoding": "gzip" },
  });
  expect(assetResponse.status()).toBe(200);
  expect(assetResponse.headers()["content-encoding"]).toBe("gzip");
  expect(assetResponse.headers()["cache-control"]).toContain("immutable");
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
  await page.goto("/admin#documents");
  await page.getByRole("checkbox", { name: "Document sensible" }).check();
  const watermarkPosition = page.getByLabel("Position du filigrane");
  await expect(watermarkPosition).toBeVisible();
  await watermarkPosition.selectOption("FOOTER");
  await expect(
    page.locator(".watermark-preview .sensitive-watermark.footer"),
  ).toHaveText("SENSITIVE DOCUMENT");
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
          ...(item.title === wordTitle
            ? { sensitive: "true", watermarkPosition: "FOOTER" }
            : {}),
          file: {
            name: item.name,
            mimeType: item.mimeType,
            buffer: Buffer.from(item.buffer),
          },
        },
      });
      expect(response.status(), item.name).toBe(201);
      const created = (await response.json()) as {
        id: string;
        sensitive: boolean;
        watermarkPosition: string;
      };
      createdIds.push(created.id);
      if (item.title === wordTitle) {
        expect(created.sensitive).toBe(true);
        expect(created.watermarkPosition).toBe("FOOTER");
      }
      expect(
        (
          await request.post(`/api/admin/documents/${created.id}/publish`)
        ).status(),
      ).toBe(201);
      if (item.title === wordTitle) {
        const download = await request.get(
          `/api/documents/${created.id}/download?locale=fr`,
        );
        expect(download.status()).toBe(200);
        const distributed = unzipSync(new Uint8Array(await download.body()));
        const documentXml = strFromU8(distributed["word/document.xml"]);
        expect(documentXml).toContain("SENSITIVE DOCUMENT");
        expect(documentXml).toContain("mso-position-vertical:bottom");
      }
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
    await expect(
      page.locator(".document-preview-frame .sensitive-watermark.footer"),
    ).toHaveText("SENSITIVE DOCUMENT");
    await page.getByRole("button", { name: "Fermer" }).click();

    await search.fill(excelTitle);
    await page.getByText(excelTitle, { exact: true }).first().click();
    await expect(page.getByText("Consultation en lecture seule")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Contrôle" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Conforme" })).toBeVisible();
    await expect(
      page.locator(".document-preview-frame .sensitive-watermark"),
    ).toHaveCount(0);

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

test("the audit journal automatically retains at most 50 events", async ({
  request,
}) => {
  const response = await request.get("/api/admin/audit?limit=200");
  expect(response.status()).toBe(200);
  const audit = (await response.json()) as {
    items: unknown[];
    total: number;
  };
  expect(audit.total).toBeLessThanOrEqual(50);
  expect(audit.items).toHaveLength(audit.total);
});

test("portal and administration have no serious accessibility violations", async ({
  page,
}) => {
  for (const route of ["/", "/admin", "/admin#governance"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact || ""),
    );
    expect(violations, route).toEqual([]);
  }
});
