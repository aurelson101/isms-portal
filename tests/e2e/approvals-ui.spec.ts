import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`approval decisions are clear and responsive at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "fr"));
    let decided = false;
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/me" || url.pathname === "/api/admin/check")
        return route.fulfill({
          json: {
            username: "approver@example.test",
            isAdmin: true,
            isModerator: false,
            locale: "fr",
          },
        });
      if (url.pathname === "/api/approvals")
        return route.fulfill({
          json: [
            {
              id: "approval-id",
              operation: "PERMANENT_DELETE",
              targetType: "DOCUMENT",
              targetId: "Record retention",
              requestedBy: "requester@example.test",
              reason: "Retention period has expired.",
              status: decided ? "APPROVED" : "PENDING",
              approvedBy: decided ? "approver@example.test" : null,
              approvedAt: decided ? "2026-09-21T12:00:00Z" : null,
              createdAt: "2026-09-21T10:00:00Z",
              canDecide: true,
            },
          ],
        });
      if (url.pathname === "/api/reviews")
        return route.fulfill({
          json: [
            {
              id: "review-id",
              owner: "owner@example.test",
              reviewer: "reviewer@example.test",
              approver: "approver@example.test",
              dueAt: "2026-10-01T10:00:00Z",
              status: "PENDING",
              decidedBy: null,
              decidedAt: null,
              createdAt: "2026-09-21T10:00:00Z",
              decisionComment: null,
              canDecide: true,
              document: {
                slug: "policy",
                translations: [
                  { locale: "fr", title: "Politique de sécurité" },
                ],
              },
            },
          ],
        });
      if (
        url.pathname === "/api/approvals/approval-id/decision" &&
        request.method() === "PUT"
      ) {
        decided = true;
        return route.fulfill({ json: {} });
      }
      if (url.pathname === "/api/admin/documents")
        return route.fulfill({ json: { items: [], total: 0 } });
      if (url.pathname === "/api/admin/audit")
        return route.fulfill({ json: { items: [] } });
      if (url.pathname === "/api/admin/dashboard")
        return route.fulfill({ json: null });
      if (url.pathname === "/api/health/details")
        return route.fulfill({ json: { services: {} } });
      return route.fulfill({
        json: url.pathname === "/api/branding" ? {} : [],
      });
    });
    await page.goto("/approvals#approval-approval-id");
    await expect(
      page.getByRole("heading", { name: "Approbations et revues" }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      /\/admin\?request=approval-approval-id#approvals$/,
    );
    if (width === 390)
      await page
        .getByRole("button", { name: "Afficher la navigation", exact: true })
        .click();
    const navigation = page.locator("#admin-navigation");
    await expect(
      navigation.getByRole("button", { name: "Infrastructure", exact: true }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page
        .locator("#admin-navigation-infrastructure")
        .getByRole("button", { name: "Approbations et revues", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      navigation.getByRole("button", { name: "Gouvernance ISMS", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".approvals-navigation")).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath("infrastructure-navigation.png"),
      fullPage: true,
    });
    if (width === 390) {
      await page
        .getByRole("button", { name: "Masquer la navigation", exact: true })
        .press("Escape");
      await expect(
        page.getByRole("button", {
          name: "Afficher la navigation",
          exact: true,
        }),
      ).toHaveAttribute("aria-expanded", "false");
    }
    await expect(page.locator("#approval-approval-id")).toBeVisible();
    await expect(page.locator("#review-review-id")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Commentaire de décision" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Examiner et décider" }).click();
    await page
      .getByRole("textbox", { name: "Commentaire de décision" })
      .fill("Revue validée");
    await expect(
      page
        .locator("#review-review-id")
        .getByRole("button", { name: "Approuver", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Approuver" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refuser" }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Approuver" }).first().click();
    await expect(page.getByText("Décision par:")).toBeVisible();
    await page.getByRole("button", { name: /Revues documentaires/ }).click();
    await expect(page.locator(".approval-card")).toHaveCount(1);
    await expect(page.locator("#review-review-id")).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Rechercher une demande" })
      .fill("aucun document");
    await expect(page.locator(".approval-card")).toHaveCount(0);
    await page
      .getByRole("searchbox", { name: "Rechercher une demande" })
      .fill("Politique");
    await expect(page.locator(".approval-card")).toHaveCount(1);
  });
}

test("non-administrator participants keep access without entering administration", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
  let adminRequests = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/api/admin/")) adminRequests++;
    if (path === "/api/me")
      return route.fulfill({
        json: {
          username: "participant@example.test",
          isAdmin: false,
          isModerator: false,
          locale: "en",
        },
      });
    if (path === "/api/approvals")
      return route.fulfill({ status: 403, json: {} });
    return route.fulfill({ json: path === "/api/branding" ? {} : [] });
  });
  await page.goto("/approvals");
  await expect(
    page.getByRole("heading", { name: "Approvals and Reviews" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/approvals$/);
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0);
  expect(adminRequests).toBe(0);
});
