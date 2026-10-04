import { expect, test } from "@playwright/test";

for (const width of [320, 768, 1280]) {
  test(`observability recovery, pagination and safe actions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    const counts = { waiting: 2, active: 1, delayed: 0, completed: 21, failed: 1 };
    const history = Array.from({ length: 25 }, (_, index) => ({ id: `mail-${index}`, action: "document.published", resource: `policy-${index}`, status: index === 24 ? "FAILED" : "ACCEPTED", attempts: 1, createdAt: index === 24 ? "invalid-date" : "2026-10-02T12:00:00Z", finishedAt: null, accepted: index === 24 ? 0 : 1, error: index === 24 ? "Provider unavailable" : null }));
    let failedLoad = true; let settingsRequests = 0; let decisions = 0;
    let integrationOutcome: "ready" | "pending" | "http" | "network" | "invalid" | "unready" = "ready";
    let releaseIntegration!: () => void;
    let releaseDecision!: () => void;
    const decisionGate = new Promise<void>((resolve) => { releaseDecision = resolve; });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/admin/check") return route.fulfill({ json: { isAdmin: true, username: "admin@example.test", displayName: "Test administrator", locale: "fr", authentication: { source: "local", ssoConnected: false, diagnostics: { groupCount: 0, mappedSpaceCount: 0 } } } });
      if (path === "/api/admin/dashboard") return route.fulfill({ json: { groups: 0, rules: 0, spaces: 0, documents: 25, syncErrors: 0, attention: { total: 0 } } });
      if (path === "/api/health/details") return route.fulfill({ json: { services: { postgres: true, redis: true, clamav: true }, storage: { availableBytes: 1024 ** 3, totalBytes: 2 * 1024 ** 3, usedBytes: 1024 ** 3, usedPercent: 50 } } });
      if (path === "/api/admin/audit") return route.fulfill({ json: { items: [] } });
      if (path === "/api/admin/operations/summary") return route.fulfill(failedLoad ? { status: 503, json: { message: "Unavailable" } } : { json: { failures: 1, denied: 2, accessRequests: 25, reports: 0, unreadNotifications: 0 } });
      if (path === "/api/admin/operations/work-items") return route.fulfill({ json: { accessRequests: Array.from({ length: 25 }, (_, index) => ({ id: `access-${index}`, identity: `user-${index}@example.test`, justification: "Long justification with text that must wrap on mobile", status: "PENDING" })), reports: [], reviews: [], approvals: [] } });
      if (path === "/api/admin/operations/integrations") return route.fulfill({ json: { settings: [] } });
      if (path === "/api/admin/operations/integrations/wazuh/test") {
        if (integrationOutcome === "pending") await new Promise<void>((resolve) => { releaseIntegration = resolve; });
        if (integrationOutcome === "http") return route.fulfill({ status: 503, json: { message: "Unavailable" } });
        if (integrationOutcome === "network") return route.abort("failed");
        if (integrationOutcome === "invalid") return route.fulfill({ contentType: "application/json", body: "not-json" });
        return route.fulfill({ json: { applicationHealthy: integrationOutcome !== "unready", metricsAvailable: true, artifactsAvailable: true } });
      }
      if (path === "/api/admin/operations/alert-policy") { settingsRequests++; return route.fulfill({ json: { enabled: false, channel: "none", destinationReference: "", fiveXxPercent: "5", deniedPerMinute: "20" } }); }
      if (path === "/api/admin/operations/alert-channels") return route.fulfill({ json: { smtpHost: "smtp.example.test", configured: { email: true, teams: false, slack: false, webhook: false } } });
      if (path === "/api/admin/operations/email-deliveries/counts") return route.fulfill({ json: counts });
      if (path === "/api/admin/operations/email-deliveries") return route.fulfill({ json: history });
      if (path.startsWith("/api/admin/operations/access-requests/") && method === "PUT") { decisions++; await decisionGate; return route.fulfill({ status: 500, json: { message: "Failed" } }); }
      if (path.startsWith("/api/admin/operations/email-deliveries/") && method === "POST") return route.fulfill({ status: 500, json: { message: "Failed" } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/admin#observability");
    const panel = page.locator(".observability-panel");
    const refresh = panel.getByRole("button", { name: "Actualiser les données", exact: true });
    await expect(panel.getByRole("alert")).toContainText("Chargement incomplet");
    await expect(refresh).toBeEnabled();
    failedLoad = false; await refresh.click();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await expect(panel).toContainText("Dernière actualisation");
    const emailSection = panel.locator(".operations-work-items").filter({ has: page.getByRole("heading", { name: "Suivi des e-mails" }) });
    await expect(emailSection.locator("tbody tr")).toHaveCount(20);
    const emailPages = panel.getByRole("navigation", { name: "Pagination des e-mails" });
    await emailPages.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(emailSection.locator("tbody tr")).toHaveCount(5);
    await expect(emailSection).not.toContainText("Invalid Date");
    await emailSection.getByLabel("Rechercher un événement ou une ressource").fill("policy-24");
    await expect(emailSection.locator("tbody tr")).toHaveCount(1);
    await emailSection.getByRole("button", { name: "Relancer", exact: true }).click();
    await expect(emailSection.getByRole("alert")).toContainText("La relance a échoué");
    const workSection = panel.locator(".operations-work-items").filter({ has: page.getByRole("heading", { name: "Demandes et signalements à traiter" }) });
    await expect(workSection.locator("tbody tr")).toHaveCount(20);
    await panel.getByRole("navigation", { name: "Pagination des éléments à traiter" }).getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(workSection.locator("tbody tr")).toHaveCount(5);
    await panel.locator("summary").click();
    const wazuh = panel.locator(".integration-card").filter({ has: page.getByRole("heading", { name: "Wazuh", exact: true }) });
    await expect(wazuh.getByRole("link", { name: "Configuration de l’agent" })).toHaveAttribute("href", "/api/admin/operations/integrations/wazuh/download?artifact=agent");
    await expect(wazuh.getByRole("link", { name: "Événements de test" })).toHaveAttribute("href", "/api/admin/operations/integrations/wazuh/download?artifact=samples");
    const integrationTest = wazuh.getByRole("button", { name: "Tester la préparation", exact: true });
    await integrationTest.click();
    await expect(wazuh.getByRole("status")).toContainText("Préparation locale validée");
    integrationOutcome = "pending";
    await integrationTest.click();
    await expect(wazuh.getByRole("status")).toContainText("Test en cours");
    await expect(integrationTest).toBeDisabled();
    await expect(refresh).toBeDisabled();
    await expect.poll(() => typeof releaseIntegration).toBe("function");
    releaseIntegration();
    await expect(wazuh.getByRole("status")).toContainText("Préparation locale validée");
    for (const outcome of ["http", "network", "invalid", "unready"] as const) {
      integrationOutcome = outcome;
      await integrationTest.click();
      await expect(wazuh.getByRole("status")).toContainText("Préparation locale en échec");
      await expect(integrationTest).toBeEnabled();
      await expect(refresh).toBeEnabled();
      integrationOutcome = "ready";
      await integrationTest.click();
      await expect(wazuh.getByRole("status")).toContainText("Préparation locale validée");
    }
    await expect(wazuh.getByRole("status")).toContainText("Collecte externe non vérifiée");
    const host = panel.getByLabel("Serveur SMTP", { exact: true });
    await host.fill("unsaved.example.test");
    const requestsBefore = settingsRequests;
    await refresh.click();
    await expect(refresh).toBeEnabled(); await expect(host).toHaveValue("unsaved.example.test");
    expect(settingsRequests).toBe(requestsBefore);
    await workSection.getByRole("button", { name: "Approuver", exact: true }).first().click();
    await expect(workSection.getByRole("button", { name: "Refuser", exact: true }).first()).toBeDisabled();
    expect(decisions).toBe(1); releaseDecision();
    await expect(panel.getByRole("alert").first()).toContainText("L’opération a échoué");
    await expect(workSection.locator("tbody tr")).toHaveCount(5);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("observability-expanded.png"), fullPage: false });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.locator("summary").click();
    await refresh.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("observability.png"), fullPage: false });
  });
}
