import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationService } from "./authorization.service";
import type { PrismaService } from "./prisma.service";

describe("AuthorizationService", () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const prisma = {
    documentSpace: { findMany, count },
  } as unknown as PrismaService;
  const service = new AuthorizationService(prisma);

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
  });

  it("grants every permission to an administrator without a per-space rule", async () => {
    findMany.mockResolvedValue([
      { id: "space-it", slug: "it", accessRules: [] },
    ]);
    const permissions = [
      "showMenu",
      "read",
      "search",
      "preview",
      "download",
      "upload",
      "edit",
      "publish",
      "archive",
    ] as const;
    for (const permission of permissions)
      await expect(
        service.can(["ISMS-LOCAL-ADMINS"], "space-it", permission),
      ).resolves.toBe(true);
    const permitted = await service.permittedSpacesFor(
      ["ISMS-LOCAL-ADMINS"],
      permissions,
    );
    for (const permission of permissions)
      expect(permitted.get(permission)).toHaveLength(1);
    expect(count).not.toHaveBeenCalled();
  });

  it("denies by default when no group rule grants the permission", async () => {
    count.mockResolvedValue(0);
    await expect(
      service.can(["Domain Users"], "space-it", "download"),
    ).resolves.toBe(false);
  });

  it("denies an anonymous identity without querying access rules", async () => {
    count.mockClear();
    await expect(service.can([], "space-it", "read")).resolves.toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it("matches standard user groups case-insensitively", async () => {
    findMany.mockResolvedValue([]);
    await service.permittedSpaces(["ITAD"], "search");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              accessRules: {
                some: expect.objectContaining({
                  group: {
                    active: true,
                    OR: [{ name: { equals: "ITAD", mode: "insensitive" } }],
                  },
                }),
              },
            }),
          ]),
        }),
      }),
    );
  });

  it("loads spaces once when calculating several permissions", async () => {
    findMany.mockResolvedValue([
      {
        id: "space-it",
        slug: "it",
        accessRules: [
          { read: true, search: false, preview: true, download: false },
        ],
        categories: [],
      },
    ]);

    const permissions = await service.permittedSpacesFor(
      ["SkillsRDP"],
      ["read", "search", "preview", "download"],
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(permissions.get("read")).toHaveLength(1);
    expect(permissions.get("preview")).toHaveLength(1);
    expect(permissions.get("search")).toHaveLength(0);
    expect(permissions.get("download")).toHaveLength(0);
  });

  it.each([
    "showMenu",
    "read",
    "search",
    "preview",
    "download",
    "upload",
    "edit",
    "publish",
    "archive",
  ] as const)("checks %s independently", async (permission) => {
    count.mockResolvedValue(1);
    await expect(
      service.can(["SkillsRDP"], "space-it", permission),
    ).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "space-it",
        OR: expect.arrayContaining([
          expect.objectContaining({
            accessRules: {
              some: expect.objectContaining({ [permission]: true }),
            },
          }),
        ]),
      }),
    });
  });

  it("grants every permission to the active owner group of a space", async () => {
    count.mockResolvedValue(1);
    await expect(
      service.can(["Owners-IT"], "space-it", "archive"),
    ).resolves.toBe(true);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          {
            ownerGroup: {
              active: true,
              OR: [
                {
                  name: {
                    equals: "Owners-IT",
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        ]),
      }),
    });
  });
});
