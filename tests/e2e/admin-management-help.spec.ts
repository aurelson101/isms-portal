import { expect, test } from "@playwright/test";

for (const width of [320, 1280]) {
  test(`admin management and bilingual help at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [] };
    const groups = Array.from({ length: 21 }, (_, index) => ({ id: `group-${index}`, name: `Group ${index + 1}`, distinguishedName: `CN=Group${index + 1},DC=example,DC=test`, description: "", memberCount: 1, active: index < 20, accessRules: [] }));
    const rules = groups.map((group, index) => ({ id: `rule-${index}`, groupId: group.id, spaceId: space.id, group, space, read: true, preview: true, download: false }));
    const queries: URLSearchParams[] = [];
    let createdModerator: Record<string, unknown> | undefined;
    const permissions = { role: "MODERATOR", canManageDocuments: true, canPublishDocuments: false, canDeleteDocuments: false };
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = [];
      if (url.pathname === "/api/admin/check") json = { isAdmin: true, username: "admin@example.test", displayName: "Administrator", locale: "fr" };
      else if (url.pathname === "/api/admin/accounts") {
        if (route.request().method() === "POST") { createdModerator = route.request().postDataJSON(); json = { id: "new-moderator" }; }
        else json = [{ id: "moderator", username: "moderator@example.test", displayName: "Test Moderator", source: "LOCAL", ...permissions }];
      }
      else if (url.pathname === "/api/admin/accounts/groups") json = [{ id: "moderator-group", name: "Test Moderators", distinguishedName: "CN=Moderators,DC=example,DC=test", ...permissions }];
      else if (url.pathname === "/api/admin/groups") json = groups;
      else if (url.pathname === "/api/admin/spaces") json = [space];
      else if (url.pathname === "/api/admin/access-rules") json = rules;
      else if (url.pathname === "/api/admin/dashboard") json = { groups: 21, rules: 21, spaces: 1, documents: 0, attention: { total: 0 } };
      else if (url.pathname === "/api/admin/audit") json = { items: [] };
      else if (url.pathname === "/api/health/details") json = { services: { postgres: true, redis: true, clamav: true }, storage: {} };
      else if (url.pathname === "/api/admin/documents") { queries.push(url.searchParams); json = { items: [], total: 0 }; }
      return route.fulfill({ json });
    });
    await page.goto("/admin#moderators");
    await expect(page.getByRole("heading", { name: "Comptes modérateurs", exact: true })).toBeVisible();
    const activeLanguage = page.locator('.admin-language button[aria-pressed="true"]');
    await activeLanguage.hover();
    await expect(activeLanguage).toHaveCSS("background-color", "rgb(7, 104, 234)");
    await expect(activeLanguage).toHaveCSS("color", "rgb(255, 255, 255)");
    const configurationMenus = page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("button");
    if (width === 320) await page.getByRole("button", { name: "Afficher la navigation", exact: true }).click();
    const frenchMenus = (await configurationMenus.allTextContents()).map(name => name.trim());
    expect(frenchMenus.indexOf("Comptes administrateurs")).toBeGreaterThan(-1);
    expect(frenchMenus.indexOf("Comptes modérateurs")).toBe(frenchMenus.indexOf("Comptes administrateurs") + 1);
    if (width === 320) await page.getByRole("button", { name: "Masquer la navigation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Modérateurs configurés" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Gérer", exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    const localForm = page.locator("form").filter({ has: page.getByRole("heading", { name: "Ajouter un modérateur local" }) });
    await localForm.getByLabel("Nom affiché").fill("New Test Moderator");
    await localForm.getByLabel("Identifiant").fill("new-moderator@example.test");
    await localForm.getByLabel("Mot de passe fort").fill("Test-only-password-2026!");
    await localForm.getByLabel("Justification des privilèges").fill("Test fixture only");
    await localForm.getByRole("button", { name: "Ajouter le modérateur" }).click();
    await expect(page.getByRole("status")).toContainText("Modérateur ajouté.");
    await expect(localForm.getByLabel("Identifiant")).toHaveValue("");
    expect(createdModerator).toMatchObject({ role: "MODERATOR", source: "LOCAL", username: "new-moderator@example.test" });
    await page.locator(".admin-language").getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Moderator accounts", exact: true })).toBeVisible();
    await activeLanguage.hover();
    await expect(activeLanguage).toHaveCSS("background-color", "rgb(7, 104, 234)");
    await expect(activeLanguage).toHaveCSS("color", "rgb(255, 255, 255)");
    if (width === 320) await page.getByRole("button", { name: "Show navigation", exact: true }).click();
    const englishMenus = (await configurationMenus.allTextContents()).map(name => name.trim());
    expect(englishMenus.indexOf("Administrator accounts")).toBeGreaterThan(-1);
    expect(englishMenus.indexOf("Moderator accounts")).toBe(englishMenus.indexOf("Administrator accounts") + 1);
    if (width === 320) await page.getByRole("button", { name: "Hide navigation", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Manage", exact: true })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: "Add an Active Directory group" })).toBeVisible();
    await page.locator(".admin-language").getByRole("button", { name: "FR", exact: true }).click();
    await page.goto("/admin#groups");
    await expect(page.locator(".admin-actions-table tbody tr")).toHaveCount(20);
    await page.getByRole("navigation", { name: "Pagination des groupes" }).getByRole("button", { name: "Suivant" }).click();
    await expect(page.locator(".admin-actions-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".admin-actions-table tbody")).toContainText("Group 21");
    await page.locator(".admin-management-tools select").selectOption("inactive");
    await expect(page.getByRole("navigation", { name: "Pagination des groupes" })).toHaveCount(0);
    await expect(page.locator(".admin-actions-table tbody")).toContainText("Group 21");
    await page.goto("/admin#rules");
    await expect(page.locator(".matrix tbody tr")).toHaveCount(20);
    await page.locator(".admin-management-tools select").first().selectOption("group-20");
    await expect(page.locator(".matrix tbody tr")).toHaveCount(1);
    const edit = page.getByRole("button", { name: "Éditer Group 21", exact: true });
    await edit.focus(); await page.keyboard.press("Enter");
    await expect(page.locator(".drawer")).toBeVisible();
    await page.goto("/admin#documents");
    await page.getByLabel("Rechercher un document", { exact: true }).fill("policy & travel");
    await expect.poll(() => queries.at(-1)?.get("q")).toBe("policy & travel");
    expect(queries.at(-1)?.get("page")).toBe("1");
    await page.locator(".admin-management-tools select").selectOption("status");
    await expect.poll(() => queries.at(-1)?.get("sort")).toBe("status");
    await page.goto("/admin#help");
    await expect(page.getByRole("heading", { name: "Aide ISMS Portal", exact: true })).toBeVisible();
    await expect(page.locator(".admin-help article")).toHaveCount(1);
    await expect(page.locator(".admin-help-topic-picker option")).toHaveCount(26);
    await page.locator(".admin-help-pagination").getByRole("button", { name: "Suivant" }).click();
    await expect(page.locator(".admin-help article h2")).toHaveText("Espaces et catégories");
    await expect(page.locator(".admin-help-overview-steps li")).toHaveCount(3);
    await expect(page.locator(".admin-help-technical code")).toContainText("parent = Procedures");
    await expect(page.locator(".admin-help-technical")).toContainText("pas sur une sous-catégorie isolée");
    await page.locator(".admin-help-pagination").getByRole("button", { name: "Précédent" }).click();
    if (width <= 900) await page.getByLabel("Rubrique", { exact: true }).selectOption({ label: "Connexion Microsoft SSO" });
    else await page.locator(".admin-help-topics").getByRole("button", { name: "Connexion Microsoft SSO", exact: true }).click();
    await expect(page.locator(".admin-help article h2")).toHaveText("Connexion Microsoft SSO");
    await expect(page.locator(".admin-help-overview-steps li")).toHaveCount(3);
    await expect(page.locator(".admin-help-technical code")).toContainText("ENTRA_CLIENT_ID=YOUR_APPLICATION_UUID");
    await expect(page.locator(".admin-help-technical-warning")).toContainText("ne prend pas en charge un certificat client");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("help-workspace.png"), fullPage: false });
    await page.getByLabel("Rechercher dans l’aide").fill("no-matching-topic");
    await expect(page.locator(".admin-help article")).toHaveCount(0);
    await page.locator(".admin-help").getByRole("button", { name: "Réinitialiser" }).click();
    await expect(page.getByRole("button", { name: "FR", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveCount(1);
    await page.locator(".admin-language").getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ISMS Portal help", exact: true })).toBeVisible();
    await expect(page.locator(".admin-help article")).toHaveCount(1);
    for (let index = 0; index < 26; index++) {
      if (width <= 900) await page.getByLabel("Topic", { exact: true }).selectOption(String(index));
      else await page.locator(".admin-help-topics button").nth(index).click();
      await expect(page.locator(".admin-help-technical code")).toBeVisible();
      await expect(page.locator(".admin-help-technical-warning")).not.toBeEmpty();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    for (const [query, value] of [["s3.example.com", "mount = documents"], ["smtpStartTls", "smtpPort = 587"], ["canManageDocuments", "canPublishDocuments = false"], ["retentionUntil", "legalHold = false"]]) {
      await page.getByLabel("Search help").fill(query);
      await expect(page.locator(".admin-help-technical code")).toContainText(value);
    }
    await page.getByLabel("Search help").fill("canManageDocuments");
    for (const [locale, content] of [["FR", "Documents gérés, Import de documents et Mes droits documentaires"], ["EN", "Managed documents, Document import and My document permissions"], ["ES", "Documentos gestionados, Importación documental y Mis permisos documentales"], ["SK", "Spravované dokumenty, Import dokumentov a Moje práva pre dokumenty"]]) {
      await page.locator(".admin-language").getByRole("button", { name: locale, exact: true }).click();
      await expect(page.locator(".admin-help article")).toContainText(content);
      await expect(page.locator(".admin-help-technical code")).toContainText("limit=20&managed=true&space=it");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator(".admin-language").getByRole("button", { name: "FR", exact: true }).click();
    await expect(page.locator(".admin-help-technical summary")).toHaveText("Atelier technique : configuration pas à pas");
    await page.locator(".admin-language").getByRole("button", { name: "EN", exact: true }).click();
    await page.getByLabel("Search help").fill("ENTRA_CLIENT_ID");
    await expect(page.locator(".admin-help article h2")).toHaveText("Microsoft SSO sign-in");
    await expect(page.locator(".admin-help-technical-warning")).toContainText("does not support a client certificate");
    const workshop = page.locator(".admin-help-technical");
    await workshop.locator("summary").click();
    await expect(workshop).not.toHaveAttribute("open");
    await workshop.locator("summary").click();
    await expect(workshop).toHaveAttribute("open", "");
    await page.getByLabel("Search help").fill("LDAP / LDAPS");
    await expect(page.locator(".admin-help article")).toHaveCount(1);
    await expect(page.locator(".admin-help-technical code")).toContainText("loginAttribute = sAMAccountName");
    await expect(page.locator(".admin-help-technical code")).toContainText("protocol = LDAPS");
    await page.getByLabel("Search help").fill("verify_hostname");
    await expect(page.locator(".admin-help-technical code")).toContainText("-verify_return_error");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Search help").fill("LDAP / LDAPS");
    await page.locator(".admin-help article").getByRole("button", { name: "Open menu" }).click();
    await expect(page).toHaveURL(/#directory$/);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
