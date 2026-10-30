import { Injectable } from "@nestjs/common";
import type {
  AccessRule,
  DocumentCategory,
  DocumentSpace,
} from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { isAdminIdentity, isModeratorIdentity, moderatorCan } from "./security";
import { categoryAllowed, resolveCategories, type CategoryScope } from "./category-permissions";

type SpaceWithRule = DocumentSpace & CategoryScope & {
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
    spaceId?: string,
  ) {
    const result = new Map<Permission, SpaceWithRule[]>(
      permissions.map((permission) => [permission, []]),
    );
    if (groups.length === 0 || permissions.length === 0) return result;
    const administrator = isAdminIdentity(groups);
    const moderator = isModeratorIdentity(groups);
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
        ...(spaceId ? { id: spaceId } : {}),
        ...(!administrator && !moderator
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
        accessRules: {
          where: {
            group: { active: true },
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
      const matches = (rule: SpaceWithRule["accessRules"][number]) => !rule.group || groups.some(name => name.toLowerCase() === rule.group!.name.toLowerCase());
      result.set(
        permission,
        spaces.map(space => {
          const privileged = administrator || moderatorCan(groups, permission);
          const owner = permission !== "download" && space.ownerGroup?.active && groups.some(name => name.toLowerCase() === space.ownerGroup!.name.toLowerCase());
          const aclRoot = Boolean(privileged || owner || space.accessRules.some(rule => !rule.categoryId && matches(rule) && rule[permission])
            || (temporaryGrantPermissions.has(permission) && (space.temporaryAccessGrants?.length || 0) > 0));
          const aclCategories = privileged || owner ? (space.categories || []).map(category => category.id)
            : resolveCategories(space.categories || [], space.accessRules.map(rule => ({ categoryId: rule.categoryId, allowed: matches(rule) && rule[permission] })), aclRoot);
          return { ...space, accessRules: space.accessRules.filter(matches), aclRoot, aclCategories };
        }).filter(space => space.aclRoot || space.aclCategories.length > 0),
      );
    }
    return result;
  }

  async permittedSpaces(groups: string[], permission: Permission) {
    const permissions = await this.permittedSpacesFor(groups, permission === "showMenu" ? [permission, "read"] : [permission]);
    const spaces = permissions.get(
      permission,
    )!;
    if (permission !== "showMenu") return spaces;
    return spaces.map(space => {
      const readable = permissions.get("read")?.find(item => item.id === space.id);
      const visible = new Set(space.aclCategories);
      const nodes = new Map((space.categories || []).map(category => [category.id, category]));
      for (const id of [...visible]) {
        let parent = nodes.get(id)?.parentId;
        const visited = new Set<string>();
        while (parent && !visited.has(parent)) { visited.add(parent); visible.add(parent); parent = nodes.get(parent)?.parentId; }
      }
      return { ...space, categories: (space.categories || []).filter(category => visible.has(category.id)).map(category => ({ ...category, _count: categoryAllowed(readable, category.id) ? category._count : { documents: 0 } })) };
    });
  }

  async can(groups: string[], spaceId: string, permission: Permission, categoryId?: string | null) {
    if (isAdminIdentity(groups) || moderatorCan(groups, permission)) return true;
    if (groups.length === 0) return false;
    if (categoryId !== undefined) return categoryAllowed((await this.permittedSpacesFor(groups, [permission], spaceId)).get(permission)!.find(space => space.id === spaceId), categoryId);
    const now = new Date();
    const administrator = isAdminIdentity(groups) || isModeratorIdentity(groups);
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
                  categoryId: null,
                  group: {
                    active: true,
                    OR: groupNames,
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
