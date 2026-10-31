import { expect, test } from "./test";

for (const width of [390, 768, 1280]) {
  test(`email history filtering, refresh and retry errors at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const requests: string[] = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      let json: unknown = [];
      if (url.pathname.startsWith("/api/admin/operations/"))
        requests.push(url.pathname);
      if (url.pathname === "/api/admin/check")
        json = {
          isAdmin: true,
          username: "admin@example.test",
          displayName: "Test admin",
          primaryAdmin: true,
          locale: "en",
          authentication: {
            source: "local",
            ssoConnected: false,
            diagnostics: {},
          },
        };
      else if (url.pathname === "/api/branding") json = {};
      else if (url.pathname === "/api/admin/dashboard") json = null;
      else if (url.pathname === "/api/admin/audit") json = { items: [] };
      else if (url.pathname === "/api/health/details") json = { services: {} };
      else if (url.pathname.endsWith("/work-items"))
        json = { accessRequests: [], reports: [], reviews: [], approvals: [] };
      else if (url.pathname.endsWith("/integrations")) json = { settings: [] };
      else if (url.pathname.endsWith("/summary")) json = {};
      else if (url.pathname.endsWith("/alert-channels")) json = {};
      else if (url.pathname.endsWith("/alert-policy"))
        json = {
          enabled: false,
          channel: "none",
          fiveXxPercent: "5",
          deniedPerMinute: "20",
        };
      else if (url.pathname.endsWith("/email-deliveries/counts"))
        json = { waiting: 0, active: 0, delayed: 0, completed: 2, failed: 1 };
      else if (url.pathname.endsWith("/email-deliveries"))
        json = ["ACCEPTED", "SKIPPED", "FAILED"].map((status) => ({
          id: status,
          action: "document.publish",
          resource: `document:${status.toLowerCase()}`,
          status,
          attempts: status === "FAILED" ? 4 : 1,
          accepted: status === "ACCEPTED" ? 2 : 0,
          createdAt: "2026-10-01T12:00:00Z",
          finishedAt: "2026-10-01T12:00:01Z",
          error: null,
        }));
      else if (url.pathname.endsWith("/retry")) {
        await route.fulfill({
          status: 409,
          json: { message: "Delivery is no longer failed" },
        });
        return;
      }
      await route.fulfill({ json });
    });
    await page.goto("/admin#observability");
    const section = page.locator(".operations-work-items").filter({
      has: page.getByRole("heading", { name: "Email delivery", exact: true }),
    });
    const table = section.locator("table");
    const refresh = section.getByRole("button", {
      name: "Refresh email history",
    });
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.locator("th")).toContainText([
      "Event",
      "Resource",
      "Status",
      "Attempts",
      "Accepted",
      "Date",
      "Action",
    ]);
    await expect(
      table
        .locator("tbody tr")
        .filter({ hasText: "document:failed" })
        .locator("td")
        .nth(3),
    ).toHaveText("4");
    await expect(refresh).toBeEnabled();
    requests.length = 0;
    await section
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("SKIPPED");
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await expect(table).toContainText("Not sent");
    expect(requests).toHaveLength(0);
    await refresh.click();
    await expect(refresh).toBeEnabled();
    expect(requests.sort()).toEqual([
      "/api/admin/operations/email-deliveries",
      "/api/admin/operations/email-deliveries/counts",
    ]);
    await section
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("FAILED");
    await section.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(section.getByRole("alert")).toHaveText(
      "Retry failed. Refresh the history before trying again.",
    );
    await expect(
      section.getByRole("button", { name: "Retry", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await section.screenshot({ path: info.outputPath("email-history.png") });
  });
}
