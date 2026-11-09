import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`separate review email is configurable in Advanced settings at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    let settings = { enabled: true, recipient: "helpdesk-soc@deftagroup.com" };
    const writes: (typeof settings)[] = [];
    await page.route("**/api/**", (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/me" || path === "/api/admin/check")
        return route.fulfill({
          json: {
            isAdmin: true,
            isModerator: false,
            username: "admin@example.test",
            locale: "en",
            authentication: {},
          },
        });
      if (path === "/api/admin/governance/review-ticket-email") {
        if (request.method() === "PUT") {
          settings = request.postDataJSON();
          writes.push(settings);
        }
        return route.fulfill({ json: settings });
      }
      if (path === "/api/admin/documents")
        return route.fulfill({ json: { items: [], total: 0 } });
      if (path === "/api/admin/audit")
        return route.fulfill({ json: { items: [] } });
      if (path === "/api/admin/dashboard") return route.fulfill({ json: null });
      if (path === "/api/health/details")
        return route.fulfill({ json: { services: {} } });
      return route.fulfill({ json: path === "/api/branding" ? {} : [] });
    });
    await page.goto("/admin#advanced-settings");
    const section = page
      .locator("section.admin-card")
      .filter({
        has: page.getByRole("heading", {
          name: "Separate review email (GLPI)",
          exact: true,
        }),
      });
    const recipient = section.getByRole("textbox", {
      name: "Recipient email address",
    });
    const enabled = section.getByRole("checkbox");
    const save = section.getByRole("button", { name: "Save", exact: true });
    await expect(recipient).toHaveValue("helpdesk-soc@deftagroup.com");
    await expect(enabled).toBeChecked();
    await expect(save).toBeDisabled();
    await recipient.fill("review-tickets@example.test");
    await enabled.uncheck();
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({
      enabled: false,
      recipient: "review-tickets@example.test",
    });
    await page.reload();
    await expect(recipient).toHaveValue("review-tickets@example.test");
    await expect(enabled).not.toBeChecked();
    await enabled.check();
    await save.click();
    await expect.poll(() => writes.length).toBe(2);
    expect(writes[1].enabled).toBe(true);
    await recipient.fill("invalid-address");
    await save.click();
    expect(
      await recipient.evaluate(
        (input: HTMLInputElement) => input.validity.valid,
      ),
    ).toBe(false);
    expect(writes).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("review-email-settings.png"),
      fullPage: true,
    });
  });
}
