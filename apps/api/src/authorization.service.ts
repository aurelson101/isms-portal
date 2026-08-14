import { Injectable } from "@nestjs/common";
import type {
  AccessRule,
  DocumentCategory,
  DocumentSpace,
} from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { isAdminIdentity } from "./security";

type SpaceWithRule = DocumentSpace & {
  accessRules: AccessRule[];
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
          ? { accessRules: { some: { group: groupFilter } } }
          : {}),
      },
      include: {
        accessRules: administrator ? true : { where: { group: groupFilter } },
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
          ? spaces
          : spaces.filter((space) =>
              space.accessRules.some((rule) => rule[permission]),
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
    if (isAdminIdentity(groups)) return true;
    if (groups.length === 0) return false;
    return (
      (await this.prisma.accessRule.count({
        where: {
          spaceId,
          group: {
            active: true,
            OR: groups.map((name) => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
          },
          [permission]: true,
        },
      })) > 0
    );
  }
}
