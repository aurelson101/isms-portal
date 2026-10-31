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
      return route.fulfill({ json: {} });
    });
    await page.goto("/approvals#approval-approval-id");
    await expect(
      page.getByRole("heading", { name: "Approbations et revues" }),
    ).toBeVisible();
    await expect(page.locator("#approval-approval-id")).toBeVisible();
    await expect(page.locator("#review-review-id")).toBeVisible();
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
  });
}
