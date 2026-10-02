import { expect, test } from "@playwright/test";

for (const width of [320, 768, 1280]) {
  test(`review queue pagination and decisions at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    const reviews = Array.from({ length: 24 }, (_, index) => ({
      id: String(index), owner: "owner@example.test", reviewer: "reviewer@example.test", approver: "moderator@example.test",
      dueAt: "2020-01-01T12:00:00Z", status: "IN_REVIEW", decidedBy: null, decidedAt: null, createdAt: "2020-01-01T12:00:00Z",
      decisionComment: null, canDecide: true, document: { slug: `policy-${index}`, translations: [{ locale: "en", title: `Policy ${index}` }] },
    }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let decisions = 0;
    let failRefresh = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/reviews/0/decision") {
        decisions++;
        expect(route.request().postDataJSON()).toEqual({ status: "APPROVED", comment: "Evidence checked" });
        await gate;
        reviews[0].status = "APPROVED";
        await route.fulfill({ json: {} });
      } else if (url.pathname === "/api/reviews") {
        await route.fulfill({ status: failRefresh ? 503 : 200, json: failRefresh ? { message: "Unavailable" } : reviews });
      } else if (url.pathname === "/api/approvals") {
        await route.fulfill({ json: [{ id: "0", operation: "PUBLISH", targetType: "Document", targetId: "Sensitive policy", requestedBy: "owner@example.test", reason: "Approval", status: "PENDING", approvedBy: null, approvedAt: null, createdAt: "invalid-date", canDecide: true }] });
      } else await route.fulfill({ json: {} });
    });
    await page.goto("/approvals");
    await expect(page.locator(".approval-card")).toHaveCount(20);
    await expect(page.locator("#approval-0")).toHaveCount(1);
    await expect(page.locator("#review-0")).toHaveCount(1);
    await page.getByRole("button", { name: "Action required 25", exact: true }).click();
    await expect(page.locator(".approval-card")).toHaveCount(20);
    await expect(page.locator(".approval-overdue").first()).toHaveText("Overdue");
    await page.getByRole("navigation", { name: "Request pagination" }).getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".approval-card")).toHaveCount(5);
    await page.getByRole("navigation", { name: "Request pagination" }).getByRole("button", { name: "Previous", exact: true }).click();
    const review = page.locator("#review-0");
    await review.getByLabel("Decision comment").fill(" Evidence checked ");
    page.on("dialog", (dialog) => dialog.accept());
    await review.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(review.getByLabel("Decision comment")).toBeDisabled();
    await expect(page.getByRole("combobox", { name: "Year", exact: true })).toBeDisabled();
    expect(decisions).toBe(1);
    release();
    await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Action required 24", exact: true })).toHaveAttribute("aria-pressed", "true");
    failRefresh = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".admin-alert[role=alert]")).toBeVisible();
    failRefresh = false;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.locator(".admin-alert[role=alert]")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("reviews.png") });
    await page.goto("/approvals#review-23");
    await expect(page.locator("#review-23")).toBeVisible();
    expect(failures).toEqual([]);
  });
}

test("moderator keeps server errors recoverable and validates uploads before sending", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  let failMe = true;
  let uploads = 0;
  const space = { id: "space", nameFr: "Documents", nameEn: "Documents", permissions: { edit: true, publish: true, archive: true } };
  const document = { id: "document", status: "DRAFT", space, category: null, translations: [{ locale: "en", title: "Test policy", description: "" }], versions: [{ id: "version", locale: "en", version: 1 }] };
  let query = "";
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me") await route.fulfill({ status: failMe ? 503 : 200, json: failMe ? { message: ["Temporary failure"] } : { displayName: "Test moderator", isAdmin: false, isModerator: true, locale: "en", spaces: [space] } });
    else if (url.pathname === "/api/documents") { query = url.searchParams.get("q") || ""; await route.fulfill({ json: { items: [document], page: 1, totalPages: 1 } }); }
    else if (url.pathname === "/api/documents/upload") { uploads++; await route.fulfill({ json: {} }); }
    else await route.fulfill({ json: [] });
  });
  await page.goto("/moderator");
  await expect(page.locator(".error-state")).toHaveText("Temporary failure");
  await expect(page).toHaveURL(/\/moderator$/);
  failMe = false;
  await page.getByRole("button", { name: /Retry|Réessayer/ }).click();
  await page.getByRole("searchbox", { name: "Search documents" }).fill(" policy ");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "New version", exact: true })).toBeEnabled();
  expect(query).toBe("policy");
  await page.getByRole("button", { name: "New version", exact: true }).click();
  await page.getByLabel("Change summary").fill("Update");
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "file.exe", mimeType: "application/octet-stream", buffer: Buffer.from("not a document") });
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page.locator(".error-state")).toContainText("Unsupported format");
  expect(uploads).toBe(0);
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page.locator(".error-state")).toHaveText("The file is empty.");
  await page.getByLabel("File", { exact: true }).evaluate((input: HTMLInputElement) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page.locator(".error-state")).toHaveText("The file exceeds 50 MB.");
  await page.getByLabel("File", { exact: true }).setInputFiles({ name: "policy.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") });
  await page.getByLabel("Change summary").fill("   ");
  await page.getByRole("button", { name: "Upload and scan", exact: true }).click();
  await expect(page.locator(".error-state")).toContainText("Title and change summary are required");
  expect(uploads).toBe(0);
  expect(failures).toEqual([]);
});

for (const path of ["/login", "/admin/login"]) {
  test(`login ${path} handles network, rate limits and service failures`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("isms-locale", "en"));
    let status = 429;
    let submitted: Record<string, unknown> = {};
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/config") await route.fulfill({ json: { directoryLoginEnabled: true, ssoEnabled: "true", ssoPilotUrl: "/oauth2/start", ssoLoginUrl: null } });
      else if (route.request().method() === "POST") {
        submitted = route.request().postDataJSON();
        if (status === 0) await route.abort("failed"); else await route.fulfill({ status, json: {} });
      } else await route.fulfill({ json: {} });
    });
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Continue with Microsoft" })).toHaveCount(0);
    await page.getByLabel(path === "/login" ? "Identifier" : "Administrator username", { exact: true }).fill(" moderator@example.test ");
    await page.getByLabel("Password", { exact: true }).fill("test-only-password");
    const submit = page.locator("form").getByRole("button");
    await submit.click();
    await expect(page.locator(".error-message")).toContainText("Too many attempts");
    expect(submitted[path === "/login" ? "login" : "username"]).toBe("moderator@example.test");
    await expect(page.getByLabel("MFA code", { exact: true })).toHaveCount(0);
    status = 503;
    await submit.click();
    await expect(page.locator(".error-message")).toContainText("Service temporarily unavailable");
    status = 0;
    await submit.click();
    await expect(page.locator(".error-message")).toContainText("Connection interrupted");
    await expect(submit).toBeEnabled();
  });
}
