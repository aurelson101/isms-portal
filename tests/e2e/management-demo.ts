import type { Page } from "@playwright/test";

export async function installManagementDemo(
  page: Page,
  role: "admin" | "moderator" | "user" = "admin",
) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("isms-demo-initialized")) {
      localStorage.clear();
      sessionStorage.setItem("isms-demo-initialized", "true");
    }
    localStorage.setItem("isms-locale", "en");
  });
  const permissions = {
    read: true,
    search: true,
    preview: true,
    download: true,
    upload: role !== "user",
    edit: role !== "user",
    publish: role !== "user",
    archive: role !== "user",
  };
  const categories = [
    {
      id: "category",
      parentId: null,
      spaceId: "space",
      slug: "policies",
      nameFr: "Politiques",
      nameEn: "Policies",
      documentCount: 41,
    },
  ];
  const space = {
    id: "space",
    slug: "general",
    nameFr: "Documents généraux",
    nameEn: "General documents",
    categories,
    permissions,
  };
  const titles = [
    "Information security policy",
    "Document control procedure",
    "Access management guide",
    "Business continuity plan",
    "Information classification",
    "Supplier security requirements",
    "Remote working guide",
    "Incident response procedure",
  ];
  const documents = Array.from({ length: 41 }, (_, index) => ({
    id: `demo-document-${index + 1}`,
    slug: `demo-policy-${index + 1}`,
    space,
    category: categories[0],
    status: "PUBLISHED",
    sensitive: false,
    watermarkPosition: "CENTER",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-31T08:00:00.000Z",
    publishedAt: "2026-10-30T08:00:00.000Z",
    viewCount: 12,
    downloadCount: 2,
    favorite: index === 0,
    reviews: [],
    permissions,
    translations: [
      {
        locale: "en",
        title: `${titles[index % titles.length]}${index >= titles.length ? ` · ${index + 1}` : ""}`,
        description:
          "Demonstration document for the information security management system.",
      },
    ],
    metadata: {
      "ged.reference": `DOC-${String(index + 1).padStart(3, "0")}`,
      "ged.owner": "Documentation team",
      "ged.documentType": index % 2 ? "procedure" : "policy",
      "ged.keywords": "ISO 27001; security",
      "ged.reviewDate": "2027-10-01",
    },
    versions: [
      {
        id: `demo-version-${index + 1}`,
        locale: "en",
        version: 1,
        createdAt: "2026-10-30T08:00:00.000Z",
        storedFile: { mimeType: "application/pdf" },
      },
    ],
  }));
  const requests: URLSearchParams[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    if (path === "/api/me" || path === "/api/admin/check")
      return route.fulfill({
        json: {
          username: "alex@example.test",
          displayName: "Alex Martin",
          locale: "en",
          isAdmin: role === "admin",
          isModerator: role === "moderator",
          spaces: [space],
          authentication: {
            source: "sso",
            ssoConnected: true,
            diagnostics: {
              groupCount: 1,
              matchedGroups: ["Documentation"],
              mappedSpaceCount: 1,
            },
          },
        },
      });
    if (path === "/api/branding")
      return route.fulfill({
        json: {
          title: "ISMS Portal",
          logoDataUrl: null,
          languages: { enabled: ["fr", "en", "es", "sk"], defaultLocale: "en" },
        },
      });
    if (path === "/api/admin/spaces") return route.fulfill({ json: [space] });
    if (path === "/api/documents" || path === "/api/admin/documents") {
      requests.push(url.searchParams);
      const current = Math.max(1, Number(url.searchParams.get("page")) || 1),
        limit = Math.min(20, Number(url.searchParams.get("limit")) || 20);
      return route.fulfill({
        json: {
          items: documents.slice((current - 1) * limit, current * limit),
          total: documents.length,
          page: current,
          totalPages: Math.ceil(documents.length / limit),
          limit,
        },
      });
    }
    if (path.endsWith("/categories"))
      return route.fulfill({ json: categories });
    if (path === "/api/documents/quality/summary")
      return route.fulfill({
        json: { total: 41, missingOwner: 0, incomplete: 0, overdueReviews: 0 },
      });
    if (path.endsWith("/history"))
      return route.fulfill({
        json: {
          page: 1,
          total: 1,
          items: [
            {
              id: "audit",
              at: "2026-10-31T08:00:00.000Z",
              actor: "editor@example.test",
              action: "document.metadata.update",
              fields: ["ged.owner", "ged.reference"],
            },
          ],
        },
      });
    if (path === "/api/user-tools/updates")
      return route.fulfill({
        json: {
          since: "2026-10-01T08:00:00.000Z",
          documents: documents.slice(0, 3),
          count: 3,
        },
      });
    if (path === "/api/user-tools/recent")
      return route.fulfill({
        json: documents.slice(0, 3).map((document) => ({
          id: document.id,
          action: "OPEN",
          occurredAt: "2026-10-31T08:00:00.000Z",
          document,
        })),
      });
    if (path === "/api/admin/dashboard") return route.fulfill({ json: null });
    if (path === "/api/admin/audit")
      return route.fulfill({ json: { items: [] } });
    if (path === "/api/health/details")
      return route.fulfill({ json: { services: {} } });
    return route.fulfill({ json: [] });
  });
  return { requests, documents };
}
