import { expect, test } from "./test";

test("administrator can rename the portal without submitting language configuration", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  const languages = { enabled: ["fr", "en", "es", "sk"], defaultLocale: "fr" };
  let branding = { title: "ISMS Portal", logoDataUrl: null };
  let saved: unknown;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === "/api/branding") {
      if (request.method() === "PUT") {
        saved = request.postDataJSON();
        expect(saved).toEqual({ title: "Knowledge Portal", logoDataUrl: null });
        branding = { title: "Knowledge Portal", logoDataUrl: null };
        return route.fulfill({ json: branding });
      }
      return route.fulfill({ json: { ...branding, languages } });
    }
    if (pathname === "/api/admin/check")
      return route.fulfill({
        json: {
          isAdmin: true,
          username: "admin@example.test",
          locale: "en",
          authentication: { source: "local", diagnostics: {} },
        },
      });
    if (pathname === "/api/admin/audit")
      return route.fulfill({ json: { items: [] } });
    if (pathname === "/api/admin/dashboard")
      return route.fulfill({ json: null });
    if (pathname === "/api/health/details")
      return route.fulfill({ json: { services: {} } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin#settings");
  const form = page.locator(".branding-preview + form");
  await form.locator('input:not([type="file"])').fill("Knowledge Portal");
  await form.evaluate((element) =>
    element.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  await expect
    .poll(() => saved)
    .toEqual({ title: "Knowledge Portal", logoDataUrl: null });
  await expect(page).toHaveTitle("Knowledge Portal");
});
