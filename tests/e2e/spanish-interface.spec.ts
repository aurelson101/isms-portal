import { expect, test } from "@playwright/test";
import { browserLocale, initialLocale } from "../../apps/web/app/i18n/locale";
import { translate } from "../../apps/web/app/i18n/translate";

test.use({ locale: "es-ES" });

test("browser detection and dynamic Spanish messages", () => {
  expect(browserLocale(["sk-SK", "en-US"])).toBe("sk");
  expect(browserLocale(["sk", "es-ES"])).toBe("sk");
  expect(browserLocale(["sl-SI", "sk-SK"])).toBe("sk");
  expect(initialLocale("en", "sk")).toBe("en");
  expect(translate("sk", "", "This group contains 123 members. Continue?")).toBe("Táto skupina má 123 členov. Pokračovať?");
  expect(translate("sk", "", "This synchronized group may return during the next synchronization. 3 associated rule(s) will be deleted. Continue?")).toBe("Táto synchronizovaná skupina sa môže pri ďalšej synchronizácii obnoviť. Odstráni sa 3 priradených pravidiel. Pokračovať?");
  expect(translate("sk", "", "5 update(s) since your last visit")).toBe("Novinky od poslednej návštevy: 5");
  expect(new Intl.DateTimeFormat(translate("sk", "fr-FR", "en-GB"), { month: "long" }).format(new Date(2026, 0, 1))).toBe("január");
  expect(browserLocale(["es-MX", "en-US"])).toBe("es");
  expect(browserLocale(["de-DE", "fr-CA"])).toBe("fr");
  expect(browserLocale(["en-GB", "es-ES"])).toBe("en");
  expect(browserLocale(["de-DE"])).toBe("en");
  expect(initialLocale("fr", "es")).toBe("fr");
  expect(initialLocale("es", "fr")).toBe("es");
  expect(translate("es", "", "This group contains 123 members. Continue?")).toBe("Este grupo contiene 123 miembros. ¿Continuar?");
  expect(translate("es", "", "This synchronized group may return during the next synchronization. 3 associated rule(s) will be deleted. Continue?")).toBe("Este grupo sincronizado puede reaparecer durante la próxima sincronización. Se eliminarán 3 regla(s) asociada(s). ¿Continuar?");
  expect(translate("fr", "Original", "English")).toBe("Original");
  expect(translate("en", "Original", "English")).toBe("English");
  expect(translate("es", "", "5 update(s) since your last visit")).toBe("5 novedad(es) desde tu última visita");
  expect(translate("es", "", "Report recorded: REPORT-123")).toBe("Informe registrado: REPORT-123");
});

const labels = {
  es: { login: "Iniciar sesión", adminLogin: "Inicio de sesión de administrador", moderators: "Cuentas de moderadores", addUser: "Añadir un usuario de Active Directory", help: "Ayuda de ISMS Portal", technical: "Taller técnico: configuración paso a paso", explorer: "Explorador de documentos", moderator: "Espacio del moderador", documents: "Documentos gestionados", batch: "Importar un lote", fileLanguage: "Idioma del archivo" },
  sk: { login: "Prihlásiť sa", adminLogin: "Prihlásenie správcu", moderators: "Účty moderátorov", addUser: "Pridať používateľa Active Directory", help: "Pomocník ISMS Portal", technical: "Technický postup: konfigurácia krok za krokom", explorer: "Prieskumník dokumentov", moderator: "Priestor moderátora", documents: "Spravované dokumenty", batch: "Importovať dávku", fileLanguage: "Jazyk súborov" },
};
for (const language of ["es", "sk"] as const) test.describe(language, () => {
  test.use({ locale: language === "sk" ? "sk-SK" : "es-ES" });
  const text = labels[language];
  for (const width of [320, 768, 1280]) {
  test(`${language.toUpperCase()} interface, automatic detection and document isolation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const space = { id: "space", slug: "documents", nameFr: "Documents", nameEn: "Documents", categories: [], permissions: { showMenu: true, read: true, search: true, preview: true, download: true, upload: true, edit: true, publish: true, archive: true } };
    const identity = { isAdmin: true, isModerator: true, username: "user@example.test", displayName: "Test User", locale: "fr", groups: [], spaces: [space], preferences: { viewMode: "list", density: "comfortable" }, authentication: { source: "directory-session", ssoConnected: false, sessionExpiresAt: null, loginUrl: null, logoutUrl: null, diagnostics: { groupCount: 0, mappedSpaceCount: 1 } } };
    await page.route("**/api/**", route => {
      const url = new URL(route.request().url());
      if (route.request().method() !== "GET") return route.fulfill({ status: 204 });
      let json: unknown = [];
      if (url.pathname === "/api/auth/config") json = { directoryLoginEnabled: true, ssoEnabled: false };
      else if (url.pathname === "/api/me" || url.pathname === "/api/admin/check") json = identity;
      else if (url.pathname === "/api/admin/dashboard") json = { groups: 0, rules: 0, spaces: 1, documents: 0, attention: { total: 0 } };
      else if (url.pathname === "/api/admin/spaces") json = [space];
      else if (url.pathname === "/api/health/details") json = { services: { postgres: true, redis: true, clamav: true }, storage: {} };
      else if (url.pathname === "/api/documents" || url.pathname === "/api/admin/documents") json = { items: [], total: 0, page: 1, totalPages: 1 };
      else if (url.pathname === "/api/admin/audit") json = { items: [] };
      return route.fulfill({ json });
    });
    const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/login?local=1");
    await expect(page.getByRole("heading", { name: text.login, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await page.getByRole("button", { name: "FR", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Connexion", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await page.getByRole("button", { name: language.toUpperCase(), exact: true }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: text.login, exact: true })).toBeVisible();
    await noOverflow();
    await page.goto("/admin/login?local=1");
    await expect(page.getByRole("heading", { name: text.adminLogin, exact: true })).toBeVisible();
    await noOverflow();
    await page.goto("/admin#moderators");
    await expect(page.getByRole("heading", { name: text.moderators, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: text.addUser })).toBeVisible();
    await expect(page.locator('.admin-language button[aria-pressed="true"]')).toHaveText(language.toUpperCase());
    for (const button of await page.locator('.admin-language button, .refresh-button').all()) {
      expect(await button.evaluate(element => getComputedStyle(element).whiteSpace)).toBe("nowrap");
    }
    await noOverflow();
    await page.goto("/admin#help");
    await expect(page.getByRole("heading", { name: text.help, exact: true })).toBeVisible();
    for (let index = 0; index < 26; index++) {
      if (width <= 900) await page.locator(".admin-help-topic-picker select").selectOption(String(index));
      else await page.locator(".admin-help-topics button").nth(index).click();
      await expect(page.locator(".admin-help-content article")).toHaveCount(1);
      await expect(page.locator(".admin-help-content details summary")).toHaveText(text.technical);
      await noOverflow();
    }
    await page.goto("/explorer");
    await expect(page.getByRole("heading", { name: text.explorer, exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await noOverflow();
    await page.goto("/moderator");
    await expect(page.getByRole("heading", { name: text.moderator, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: text.documents, exact: true })).toBeVisible();
    await page.getByRole("button", { name: text.batch, exact: true }).click();
    await expect(page.getByLabel(text.fileLanguage)).toHaveValue("fr");
    await noOverflow();
    if (width === 1280) {
      await page.addInitScript(() => {
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) {
          if (key === "isms-locale") throw new DOMException("Storage blocked", "SecurityError");
          return getItem.call(this, key);
        };
      });
      await page.goto("/admin#moderators");
      await expect(page.getByRole("heading", { name: text.moderators, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await page.goto("/explorer");
      await expect(page.getByRole("heading", { name: text.explorer, exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
    }
    expect(errors).toEqual([]);
  });
  }
});
