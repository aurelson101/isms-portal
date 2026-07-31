import { describe, expect, it, vi } from "vitest";
import { AuthorizationService } from "./authorization.service";
import type { PrismaService } from "./prisma.service";

describe("AuthorizationService", () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const prisma = {
    documentSpace: { findMany },
    accessRule: { count },
  } as unknown as PrismaService;
  const service = new AuthorizationService(prisma);

  it("grants every permission to an administrator without a per-space rule", async () => {
    findMany.mockResolvedValue([
      { id: "space-it", slug: "it", accessRules: [] },
    ]);
    await expect(
      service.can(["ISMS-LOCAL-ADMINS"], "space-it", "archive"),
    ).resolves.toBe(true);
    await expect(
      service.permittedSpaces(["ISMS-LOCAL-ADMINS"], "upload"),
    ).resolves.toHaveLength(1);
    expect(count).not.toHaveBeenCalled();
  });

  it("denies by default when no group rule grants the permission", async () => {
    count.mockResolvedValue(0);
    await expect(
      service.can(["Domain Users"], "space-it", "download"),
    ).resolves.toBe(false);
  });

  it("matches standard user groups case-insensitively", async () => {
    findMany.mockResolvedValue([]);
    await service.permittedSpaces(["ITAD"], "search");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accessRules: {
            some: expect.objectContaining({
              group: {
                active: true,
                OR: [{ name: { equals: "ITAD", mode: "insensitive" } }],
              },
              search: true,
            }),
          },
        }),
      }),
    );
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
        spaceId: "space-it",
        [permission]: true,
      }),
    });
  });
});
