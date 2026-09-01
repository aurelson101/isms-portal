import { Injectable } from "@nestjs/common";
import type {
  AccessRule,
  DocumentCategory,
  DocumentSpace,
} from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { isAdminIdentity } from "./security";

type SpaceWithRule = DocumentSpace & {
  accessRules: Array<AccessRule & { group?: { name: string } }>;
  temporaryAccessGrants: Array<{ group: { name: string }; validUntil: Date }>;
  ownerGroup: { name: string; active: boolean } | null;
  categories: Array<
    DocumentCategory & {
      _count: { documents: number };
    }
  >;
};
export type Permission =
  | "showMenu"
  | "read"
  | "search"
  | "preview"
  | "download"
  | "upload"
  | "edit"
  | "publish"
  | "archive";

const temporaryGrantPermissions = new Set<Permission>([
  "showMenu",
  "read",
  "search",
  "preview",
]);

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async permittedSpacesFor(
    groups: string[],
    permissions: readonly Permission[],
  ) {
    const result = new Map<Permission, SpaceWithRule[]>(
      permissions.map((permission) => [permission, []]),
    );
    if (groups.length === 0 || permissions.length === 0) return result;
    const administrator = isAdminIdentity(groups);
    const now = new Date();
    const groupFilter = {
      active: true,
      OR: groups.map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    };
    const spaces = (await this.prisma.documentSpace.findMany({
      where: {
        deletedAt: null,
        ...(!administrator
          ? {
              OR: [
                {
                  accessRules: {
                    some: {
                      group: groupFilter,
                      AND: [
                        {
                          OR: [
                            { validFrom: null },
                            { validFrom: { lte: now } },
                          ],
                        },
                        {
                          OR: [
                            { validUntil: null },
                            { validUntil: { gt: now } },
                          ],
                        },
                      ],
                    },
                  },
                },
                {
                  temporaryAccessGrants: {
                    some: { group: groupFilter, validUntil: { gt: now } },
                  },
                },
                { ownerGroup: groupFilter },
              ],
            }
          : {}),
      },
      include: {
        accessRules: administrator
          ? {
              where: {
                group: { active: true },
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                ],
              },
              include: { group: { select: { name: true } } },
            }
          : {
              where: {
                group: groupFilter,
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
                  { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
                ],
              },
              include: { group: { select: { name: true } } },
            },
        temporaryAccessGrants: administrator
          ? { include: { group: { select: { name: true } } } }
          : {
              where: { group: groupFilter, validUntil: { gt: now } },
              include: { group: { select: { name: true } } },
            },
        ownerGroup: { select: { name: true, active: true } },
        categories: {
          where: { deletedAt: null },
          orderBy: { slug: "asc" },
          include: {
            _count: {
              select: {
                documents: {
                  where: { deletedAt: null, status: "PUBLISHED" },
                },
              },
            },
          },
        },
      },
      orderBy: { slug: "asc" },
    })) as SpaceWithRule[];
    for (const permission of permissions) {
      result.set(
        permission,
        administrator
          ? permission === "download"
            ? spaces.filter((space) =>
                space.accessRules.some((rule) => rule.download),
              )
            : spaces
          : spaces.filter((space) =>
              permission !== "download" &&
              space.ownerGroup &&
              space.ownerGroup.active &&
              groups.some(
                (name) =>
                  name.toLowerCase() === space.ownerGroup!.name.toLowerCase(),
              )
                ? true
                : space.accessRules.some((rule) => rule[permission]) ||
                  (temporaryGrantPermissions.has(permission) &&
                    (space.temporaryAccessGrants?.length || 0) > 0),
            ),
      );
    }
    return result;
  }

  async permittedSpaces(groups: string[], permission: Permission) {
    return (await this.permittedSpacesFor(groups, [permission])).get(
      permission,
    )!;
  }

  async can(groups: string[], spaceId: string, permission: Permission) {
    if (isAdminIdentity(groups) && permission !== "download") return true;
    if (groups.length === 0) return false;
    const now = new Date();
    const administrator = isAdminIdentity(groups);
    const groupNames = groups.map((name) => ({
      name: { equals: name, mode: "insensitive" as const },
    }));
    return (
      (await this.prisma.documentSpace.count({
        where: {
          id: spaceId,
          deletedAt: null,
          OR: [
            ...(!administrator && permission !== "download"
              ? [{ ownerGroup: { active: true, OR: groupNames } }]
              : []),
            {
              accessRules: {
                some: {
                  group: {
                    active: true,
                    ...(!administrator ? { OR: groupNames } : {}),
                  },
                  [permission]: true,
                  AND: [
                    { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
                    {
                      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                    },
                  ],
                },
              },
            },
            ...(!administrator && temporaryGrantPermissions.has(permission)
              ? [
                  {
                    temporaryAccessGrants: {
                      some: {
                        group: { active: true, OR: groupNames },
                        validUntil: { gt: now },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      })) > 0
    );
  }
}
