import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "./prisma.service";
import type { AuthorizationService, Permission } from "./authorization.service";
import { DocumentsController } from "./controllers";
import type { IsmsRequest } from "./types";

const general = { id: "space-general", slug: "general" };
const itSpace = { id: "space-it", slug: "it" };

describe("DocumentsController ACL scoping", () => {
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  const findFirst = vi.fn();
  const categoryFindFirst = vi.fn();
  const categoryFindMany = vi.fn().mockResolvedValue([]);
  const updateDocument = vi.fn().mockResolvedValue({});
  const upsertActivity = vi.fn().mockResolvedValue({});
  const upsertFavorite = vi.fn();
  const queryRaw = vi.fn().mockResolvedValue([]);
  const prisma = {
    document: { count, findMany, findFirst, update: updateDocument },
    documentCategory: {
      findFirst: categoryFindFirst,
      findMany: categoryFindMany,
    },
    userDocumentActivity: { upsert: upsertActivity },
    userFavorite: { upsert: upsertFavorite },
    $queryRaw: queryRaw,
    $transaction: vi.fn((operations: unknown[]) => Promise.all(operations)),
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
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    {} as never,
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
    count.mockClear();
    findMany.mockClear();
    queryRaw.mockReset().mockResolvedValue([]);
    findFirst.mockReset();
    categoryFindFirst.mockReset();
    categoryFindMany.mockReset().mockResolvedValue([]);
    updateDocument.mockClear();
    upsertActivity.mockClear();
    upsertFavorite.mockReset();
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
          { status: "PUBLISHED", spaceId: { in: [] } },
          { spaceId: { in: ["space-it"] } },
        ],
      }),
    });
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
          { status: "PUBLISHED", spaceId: { in: ["space-it"] } },
          { spaceId: { in: ["space-it"] } },
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
          { status: "PUBLISHED", spaceId: { in: ["space-general"] } },
          { spaceId: { in: [] } },
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
});
