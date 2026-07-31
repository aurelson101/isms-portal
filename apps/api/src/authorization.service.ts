import { Injectable } from "@nestjs/common";
import type { AccessRule, DocumentSpace } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { isAdminIdentity } from "./security";

type SpaceWithRule = DocumentSpace & { accessRules: AccessRule[] };
export type Permission =
  | "showMenu"
  | "read"
  | "search"
  | "preview"
  | "download"
  | "upload"
  | "edit"
  | "publish"
  | "archive"
  | "administer";

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async permittedSpaces(groups: string[], permission: Permission) {
    if (groups.length === 0) return [];
    if (isAdminIdentity(groups)) {
      return this.prisma.documentSpace.findMany({
        where: { deletedAt: null },
        include: { accessRules: true },
        orderBy: { slug: "asc" },
      }) as Promise<SpaceWithRule[]>;
    }
    return this.prisma.documentSpace.findMany({
      where: {
        deletedAt: null,
        accessRules: {
          some: {
            group: {
              active: true,
              OR: groups.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
            OR:
              permission === "administer"
                ? [{ administer: true }]
                : [{ [permission]: true }, { administer: true }],
          },
        },
      },
      include: {
        accessRules: {
          where: {
            group: {
              active: true,
              OR: groups.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
          },
        },
      },
      orderBy: { slug: "asc" },
    }) as Promise<SpaceWithRule[]>;
  }

  async can(groups: string[], spaceId: string, permission: Permission) {
    if (isAdminIdentity(groups)) return true;
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
          OR:
            permission === "administer"
              ? [{ administer: true }]
              : [{ [permission]: true }, { administer: true }],
        },
      })) > 0
    );
  }
}
