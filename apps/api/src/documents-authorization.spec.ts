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
  const queryRaw = vi.fn().mockResolvedValue([]);
  const prisma = {
    document: { count, findMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaService;
  const permittedSpaces = vi.fn();
  const authorization = {
    permittedSpaces,
  } as unknown as AuthorizationService;
  const controller = new DocumentsController(
    prisma,
    authorization,
    {} as never,
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
    permittedSpaces.mockReset();
  });

  const grant = (
    permissions: Partial<Record<Permission, Array<typeof general>>>,
  ) => {
    permittedSpaces.mockImplementation(
      (_groups: string[], permission: Permission) =>
        Promise.resolve(permissions[permission] || []),
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
        category: {
          id: categoryId,
          deletedAt: null,
          spaceId: { in: ["space-general"] },
        },
      }),
    });
  });
});
