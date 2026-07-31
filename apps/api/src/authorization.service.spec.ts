import { beforeEach, describe, expect, it, vi } from "vitest";
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

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ISMS_ADMIN_GROUPS = "ISMS-ADMINS";
  });

  it("grants every permission to an administrator without a per-space rule", async () => {
    findMany.mockResolvedValue([
      { id: "space-it", slug: "it", accessRules: [] },
    ]);
    await expect(
      service.can(["ISMS-ADMINS"], "space-it", "administer"),
    ).resolves.toBe(true);
    await expect(
      service.permittedSpaces(["ISMS-ADMINS"], "upload"),
    ).resolves.toHaveLength(1);
    expect(count).not.toHaveBeenCalled();
  });

  it("denies by default when no group rule grants the permission", async () => {
    count.mockResolvedValue(0);
    await expect(
      service.can(["Domain Users"], "space-it", "download"),
    ).resolves.toBe(false);
  });

  it("matches standard user groups case-insensitively and honors administer", async () => {
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
              OR: [{ search: true }, { administer: true }],
            }),
          },
        }),
      }),
    );
  });
});
