import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "./prisma.service";
import type { AuthorizationService, Permission } from "./authorization.service";
import { DocumentsController } from "./controllers";
import type { IsmsRequest } from "./types";

const general = { id: "space-general", slug: "general" };
const itSpace = { id: "space-it", slug: "it" };

describe("DocumentsController ACL scoping", () => {
  const auditRecord = vi.fn().mockResolvedValue(undefined);
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn();
  const categoryFindFirst = vi.fn();
  const categoryFindMany = vi.fn().mockResolvedValue([]);
  const updateDocument = vi.fn().mockResolvedValue({});
  const updateManyDocuments = vi.fn().mockResolvedValue({ count: 1 });
  const findVersion = vi.fn();
  const updateVersion = vi.fn().mockResolvedValue({});
  const upsertTranslation = vi.fn().mockResolvedValue({ locale: "en", title: "Guide" });
  const upsertActivity = vi.fn().mockResolvedValue({});
  const upsertFavorite = vi.fn();
  const reviewFindMany = vi.fn().mockResolvedValue([]);
  const deleteReviews = vi.fn().mockResolvedValue({ count: 0 });
  const deleteNotifications = vi.fn().mockResolvedValue({ count: 0 });
  const queryRaw = vi.fn().mockResolvedValue([]);
  const prisma = {
    document: { count, findMany, findFirst, update: updateDocument, updateMany: updateManyDocuments },
    documentCategory: {
      findFirst: categoryFindFirst,
      findMany: categoryFindMany,
    },
    documentVersion: { findFirst: findVersion, update: updateVersion },
    documentTranslation: { upsert: upsertTranslation },
    userDocumentActivity: { upsert: upsertActivity },
    userFavorite: { upsert: upsertFavorite },
    documentReview: { findMany: reviewFindMany, deleteMany: deleteReviews },
    userNotification: { deleteMany: deleteNotifications },
    $queryRaw: queryRaw,
    $transaction: vi.fn((operations: unknown[] | ((tx: unknown) => unknown)) => typeof operations === "function" ? operations(prisma) : Promise.all(operations)),
  } as unknown as PrismaService;
  const permittedSpacesFor = vi.fn();
  const can = vi.fn();
  const authorization = {
    permittedSpacesFor,
    can,
  } as unknown as AuthorizationService;
  const controller = new DocumentsController(
    prisma,
    authorization,
    {} as never,
    {} as never,
    { record: auditRecord } as never,
    {} as never,
    {} as never,
  );
  const request = {
    identity: {
      username: "acl-user@example.test",
      displayName: "ACL User",
      groups: ["ACL-USERS"],
      source: "directory-session",
    },
  } as IsmsRequest;

  beforeEach(() => {
    auditRecord.mockClear();
    count.mockClear();
    findMany.mockClear();
    queryRaw.mockReset().mockResolvedValue([]);
    findFirst.mockReset();
    categoryFindFirst.mockReset();
    categoryFindMany.mockReset().mockResolvedValue([]);
    updateDocument.mockClear();
    updateManyDocuments.mockReset().mockResolvedValue({ count: 1 });
    findVersion.mockReset();
    updateVersion.mockClear();
    upsertTranslation.mockClear();
    upsertActivity.mockClear();
    upsertFavorite.mockReset();
    reviewFindMany.mockReset().mockResolvedValue([]);
    deleteReviews.mockClear();
    deleteNotifications.mockClear();
    can.mockReset();
    permittedSpacesFor.mockReset();
  });

  const grant = (
    permissions: Partial<Record<Permission, Array<typeof general>>>,
  ) => {
    permittedSpacesFor.mockImplementation(
      (_groups: string[], requested: Permission[]) =>
        Promise.resolve(
          new Map(
            requested.map((permission) => [
              permission,
              permissions[permission] || [],
            ]),
          ),
        ),
    );
  };

  it.each(["preview", "download"] as const)("requires the explicit %s permission when streaming a PDF", async (permission) => {
    findFirst.mockResolvedValue({ id: "pdf-1", spaceId: general.id, status: "PUBLISHED", versions: [] });
    can.mockImplementation((_groups: string[], _spaceId: string, requested: Permission) => Promise.resolve(requested !== permission));
    await expect(controller[permission](request, {} as never, "pdf-1", "en")).rejects.toThrow();
    expect(upsertActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["1.5", "20", 1, 20],
    ["Infinity", "20", 1, 20],
    ["NaN", "20", 1, 20],
    ["-1", "20", 1, 20],
    ["9007199254740992", "20", 1, 20],
    ["2", "20.5", 2, 10],
    ["2", "Infinity", 2, 10],
    ["2", "-1", 2, 10],
    ["2", "0", 2, 10],
    ["1", "999", 1, 100],
  ])("normalizes page %s and limit %s before querying the database", async (pageValue, limitValue, page, limit) => {
    grant({ read: [general], edit: [general] });
    count.mockResolvedValueOnce(41);
    const result = await controller.list(request, "", undefined, undefined, undefined, "recent", String(pageValue), String(limitValue));
    expect(result).toMatchObject({ page, limit });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: (Number(page) - 1) * Number(limit), take: limit }));
  });

  it.each([
    ["recent", "false"],
    ["popular", "false"],
    ["recent", "true"],
    ["popular", "true"],
  ] as const)("uses a unique pagination order for %s sorting with managed=%s", async (sort, managed) => {
    grant({ read: [general], edit: [general] });
    count.mockResolvedValueOnce(41);
    await controller.list(request, "", undefined, undefined, undefined, sort, "2", "20", "false", "", "", "", managed);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      orderBy: sort === "popular"
        ? [{ viewCount: "desc" }, { downloadCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }]
        : [{ publishedAt: "desc" }, { id: "asc" }],
    }));
  });

  it("does not include manageable documents from another requested space", async () => {
    grant({ read: [general], edit: [general, itSpace] });

    await controller.list(
      request,
      "",
      undefined,
      undefined,
      "it",
      "recent",
      "1",
      "10",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          expect.objectContaining({ status: "PUBLISHED", spaceId: { in: [] } }),
          expect.objectContaining({ spaceId: { in: ["space-it"] } }),
        ],
      }),
    });
  });

  it("counts only manageable spaces for the moderator queue", async () => {
    grant({ read: [general, itSpace], edit: [itSpace] });

    await controller.list(
      request, "", undefined, undefined, undefined,
      "recent", "1", "20", "false", "", "", "", "true",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [expect.objectContaining({ spaceId: { in: ["space-it"] } })],
      }),
    });
  });

  it.each(["DRAFT", "PUBLISHED", "ARCHIVED", "QUARANTINED"])("filters %s within the requested manageable space", async status => {
    grant({ read: [general, itSpace], edit: [general, itSpace] });
    await controller.list(request, "", undefined, undefined, "it", "recent", "1", "20", "false", "", "", "", "true", status);
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ status, OR: [expect.objectContaining({ spaceId: { in: ["space-it"] } })] }) });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status }), take: 20 }));
  });

  it("rejects invalid status filters before database access", async () => {
    await expect(controller.list(request, "", undefined, undefined, undefined, "recent", "1", "20", "false", "", "", "", "true", "INVALID")).rejects.toThrow("Invalid document status");
    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("does not expose drafts to a read-only user through the status filter", async () => {
    grant({ read: [general] });
    await controller.list(request, "", undefined, undefined, undefined, "recent", "1", "20", "false", "", "", "", "false", "DRAFT");
    expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ status: "DRAFT", OR: [expect.objectContaining({ status: "PUBLISHED", spaceId: { in: ["space-general"] } }), expect.objectContaining({ spaceId: { in: [] } })] }) });
  });

  it("does not let management permissions bypass the search permission", async () => {
    grant({ search: [itSpace], edit: [general, itSpace] });
    queryRaw.mockResolvedValue([{ documentId: "document-it" }]);

    await controller.list(
      request,
      "policy",
      undefined,
      undefined,
      undefined,
      "recent",
      "1",
      "10",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [
          expect.objectContaining({ status: "PUBLISHED", spaceId: { in: ["space-it"] } }),
          expect.objectContaining({ spaceId: { in: ["space-it"] } }),
        ],
        id: { in: ["document-it"] },
      }),
    });
  });

  it("binds a category UUID to the selected authorized space", async () => {
    grant({ read: [general, itSpace] });
    const categoryId = "123e4567-e89b-42d3-a456-426614174000";
    categoryFindFirst.mockResolvedValue({ id: categoryId });
    categoryFindMany.mockResolvedValue([
      { id: categoryId, parentId: null },
      { id: "child-category", parentId: categoryId },
    ]);

    await controller.list(
      request,
      "",
      undefined,
      categoryId,
      "general",
      "recent",
      "1",
      "10",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        categoryId: { in: [categoryId, "child-category"] },
      }),
    });
  });

  it("filters favorites by the current identity without bypassing ACL", async () => {
    grant({ read: [general] });

    await controller.list(
      request,
      "",
      undefined,
      undefined,
      undefined,
      "recent",
      "1",
      "10",
      "true",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        favorites: { some: { identity: "acl-user@example.test" } },
        OR: [
          expect.objectContaining({ status: "PUBLISHED", spaceId: { in: ["space-general"] } }),
          expect.objectContaining({ spaceId: { in: [] } }),
        ],
      }),
    });
  });

  it("does not allow favoriting a document without read permission", async () => {
    findFirst.mockResolvedValue({
      id: "document-1",
      spaceId: general.id,
      status: "PUBLISHED",
    });
    can.mockResolvedValue(false);

    await expect(
      controller.addFavorite(request, "document-1"),
    ).rejects.toThrow();
    expect(upsertFavorite).not.toHaveBeenCalled();
  });

  it("allows a manager to favorite a visible draft", async () => {
    findFirst.mockResolvedValue({
      id: "draft-1",
      spaceId: general.id,
      status: "DRAFT",
    });
    can.mockImplementation(
      (_groups: string[], _spaceId: string, permission: Permission) =>
        Promise.resolve(permission === "edit"),
    );

    await expect(controller.addFavorite(request, "draft-1")).resolves.toEqual({
      favorite: true,
    });
    expect(upsertFavorite).toHaveBeenCalled();
  });

  it("combines format, document language and sensitivity filters", async () => {
    grant({ read: [general] });

    await controller.list(
      request,
      "",
      undefined,
      undefined,
      undefined,
      "recent",
      "1",
      "10",
      "false",
      "pdf",
      "fr",
      "true",
    );

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        sensitive: true,
        versions: {
          some: {
            locale: "fr",
            storedFile: { mimeType: "application/pdf" },
          },
        },
      }),
    });
  });

  it("does not expose a draft to a read-only identity", async () => {
    findFirst.mockResolvedValue({
      id: "draft-1",
      status: "DRAFT",
      spaceId: general.id,
      translations: [],
      category: null,
      space: general,
      favorites: [],
      reviews: [],
      versions: [],
    });
    can.mockImplementation(
      (_groups: string[], _spaceId: string, permission: Permission) =>
        Promise.resolve(permission === "read" || permission === "preview"),
    );

    await expect(controller.one(request, "draft-1")).rejects.toThrow();
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("allows a document manager to open a draft", async () => {
    findFirst.mockResolvedValue({
      id: "draft-1",
      status: "DRAFT",
      spaceId: general.id,
      translations: [],
      category: null,
      space: general,
      favorites: [],
      reviews: [],
      versions: [],
    });
    can.mockImplementation(
      (_groups: string[], _spaceId: string, permission: Permission) =>
        Promise.resolve(["read", "preview", "edit"].includes(permission)),
    );

    await expect(controller.one(request, "draft-1")).resolves.toEqual(
      expect.objectContaining({ id: "draft-1", status: "DRAFT" }),
    );
    expect(updateDocument).toHaveBeenCalled();
  });

  it("updates the selected file language together with its metadata", async () => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id, categoryId: null, updatedAt: new Date("2026-01-01"), translations: [] });
    findVersion.mockResolvedValueOnce({ id: "version-1", locale: "fr", version: 1 }).mockResolvedValueOnce(null);
    can.mockResolvedValue(true);

    await controller.updateMetadata(request, "doc-1", { locale: "en", versionId: "version-1", title: "Guide" });

    expect(updateVersion).toHaveBeenCalledWith({ where: { id: "version-1" }, data: { locale: "en" } });
    expect(upsertTranslation).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ locale: "en", title: "Guide" }) }));
  });

  it("refuses to overwrite an existing version in the target language", async () => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id, categoryId: null, translations: [] });
    findVersion.mockResolvedValueOnce({ id: "version-1", locale: "fr", version: 1 }).mockResolvedValueOnce({ id: "version-en" });
    can.mockResolvedValue(true);

    await expect(controller.updateMetadata(request, "doc-1", { locale: "en", versionId: "version-1", title: "Guide" })).rejects.toThrow("already exists");
    expect(updateVersion).not.toHaveBeenCalled();
    expect(upsertTranslation).not.toHaveBeenCalled();
  });

  it("rejects a stale metadata save before changing translations or language", async () => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id, categoryId: null, updatedAt: new Date("2026-01-02"), translations: [] });
    can.mockResolvedValue(true);
    updateManyDocuments.mockResolvedValueOnce({ count: 0 });
    await expect(controller.updateMetadata(request, "doc-1", { expectedUpdatedAt: "2026-01-01T00:00:00.000Z", locale: "en", title: "Stale title" })).rejects.toThrow("Document changed");
    expect(updateManyDocuments).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "doc-1", deletedAt: null, updatedAt: new Date("2026-01-01") } }));
    expect(upsertTranslation).not.toHaveBeenCalled();
    expect(updateVersion).not.toHaveBeenCalled();
  });

  it("reclassifies a document only in its authorized unchanged space and category", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: "old-category" })
      .mockResolvedValueOnce({ id: "doc-1", categoryId: "new-category" });
    can.mockResolvedValue(true);
    categoryFindFirst.mockResolvedValueOnce({ id: "new-category" });
    expect(await controller.updateCategory(request, "doc-1", { categoryId: "new-category" })).toEqual({ id: "doc-1", categoryId: "new-category" });
    expect(can).toHaveBeenCalledWith(request.identity.groups, general.id, "edit", "old-category");
    expect(can).toHaveBeenCalledWith(request.identity.groups, general.id, "edit", "new-category");
    expect(categoryFindFirst).toHaveBeenCalledWith({
      where: { id: "new-category", spaceId: general.id, deletedAt: null }, select: { id: true },
    });
    expect(updateManyDocuments).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: null, spaceId: general.id, categoryId: "old-category" },
      data: { categoryId: "new-category" },
    });
    expect(updateDocument).not.toHaveBeenCalled();
    expect(updateVersion).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(request, "document.category.update", "document:doc-1", "success", { before: "old-category", after: "new-category" });
  });

  it("allows removing a category without creating a document version", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: "old-category" })
      .mockResolvedValueOnce({ id: "doc-1", categoryId: null });
    can.mockResolvedValue(true);
    expect(await controller.updateCategory(request, "doc-1", { categoryId: null })).toEqual({ id: "doc-1", categoryId: null });
    expect(categoryFindFirst).not.toHaveBeenCalled();
    expect(updateManyDocuments).toHaveBeenCalledWith(expect.objectContaining({ data: { categoryId: null } }));
    expect(updateVersion).not.toHaveBeenCalled();
  });

  it("does not assign a missing, deleted or cross-space category", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: null });
    can.mockResolvedValue(true);
    categoryFindFirst.mockResolvedValueOnce(null);
    await expect(controller.updateCategory(request, "doc-1", { categoryId: "other-category" })).rejects.toMatchObject({ status: 400 });
    expect(updateManyDocuments).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("does not look up a target category without document edit rights", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: null });
    can.mockResolvedValue(false);
    await expect(controller.updateCategory(request, "doc-1", { categoryId: "new-category" })).rejects.toMatchObject({ status: 404 });
    expect(categoryFindFirst).not.toHaveBeenCalled();
    expect(updateManyDocuments).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("rejects a concurrent document move, deletion or reclassification", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: "old-category" });
    can.mockResolvedValue(true);
    updateManyDocuments.mockResolvedValueOnce({ count: 0 });
    await expect(controller.updateCategory(request, "doc-1", { categoryId: null })).rejects.toThrow("Document changed; refresh and retry");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(updateManyDocuments).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-1", deletedAt: null, spaceId: general.id, categoryId: "old-category" },
    }));
    expect(updateDocument).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("does not report successful reclassification after a database failure", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, categoryId: null });
    can.mockResolvedValue(true);
    updateManyDocuments.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(controller.updateCategory(request, "doc-1", { categoryId: null })).rejects.toThrow("database unavailable");
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("restores an archived document only inside the authorized space", async () => {
    const archived = { id: "doc-1", spaceId: general.id, status: "ARCHIVED", versions: [], favorites: [], translations: [] };
    findFirst.mockResolvedValueOnce(archived).mockResolvedValueOnce({ ...archived, status: "DRAFT" });
    can.mockResolvedValue(true);
    expect(await controller.userRestore(request, "doc-1")).toMatchObject({ status: "DRAFT" });
    expect(can).toHaveBeenCalledWith(request.identity.groups, general.id, "archive", null);
    expect(updateManyDocuments).toHaveBeenCalledWith({
      where: { id: "doc-1", deletedAt: null, status: "ARCHIVED", spaceId: general.id },
      data: { status: "DRAFT" },
    });
    expect(updateDocument).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledTimes(1);
  });

  it.each(["PUBLISHED", "DRAFT", "QUARANTINED"])("does not restore a %s document", async (status) => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id, status });
    can.mockResolvedValue(true);
    await expect(controller.userRestore(request, "doc-1")).rejects.toThrow("Only archived documents can be restored");
    expect(updateManyDocuments).not.toHaveBeenCalled();
    expect(updateDocument).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("does not disclose document state when restoration is unauthorized", async () => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id, status: "PUBLISHED" });
    can.mockResolvedValue(false);
    await expect(controller.userRestore(request, "doc-1")).rejects.toMatchObject({ status: 404 });
    expect(updateManyDocuments).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("rejects a restoration when the document state or space changed concurrently", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, status: "ARCHIVED" });
    can.mockResolvedValue(true);
    updateManyDocuments.mockResolvedValueOnce({ count: 0 });
    await expect(controller.userRestore(request, "doc-1")).rejects.toThrow("Document changed; refresh and retry");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(updateDocument).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("does not report a successful restoration after a database failure", async () => {
    findFirst.mockResolvedValueOnce({ id: "doc-1", spaceId: general.id, status: "ARCHIVED" });
    can.mockResolvedValue(true);
    updateManyDocuments.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(controller.userRestore(request, "doc-1")).rejects.toThrow("database unavailable");
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it("removes reviews and their notifications when a permitted document is deleted", async () => {
    findFirst.mockResolvedValue({ id: "doc-1", spaceId: general.id });
    reviewFindMany.mockResolvedValue([{ id: "review-1", evidenceObjectKey: null }]);
    can.mockResolvedValue(true);
    expect(await controller.removeByModerator(request, "doc-1")).toEqual({ deleted: true });
    expect(deleteReviews).toHaveBeenCalledWith({ where: { documentId: "doc-1" } });
    expect(deleteNotifications).toHaveBeenCalledWith({ where: { resourceType: "document-review", resourceId: { in: ["review-1"] } } });
    expect(updateDocument).toHaveBeenCalledWith({ where: { id: "doc-1" }, data: { deletedAt: expect.any(Date), status: "ARCHIVED" } });
  });
});
