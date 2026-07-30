import { Injectable } from '@nestjs/common';
import type { AccessRule, DocumentSpace } from '@prisma/client';
import { PrismaService } from './prisma.service';

type SpaceWithRule = DocumentSpace & { accessRules: AccessRule[] };

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async permittedSpaces(groups: string[], permission: 'showMenu' | 'read' | 'search' | 'preview' | 'download') {
    if (groups.length === 0) return [];
    return this.prisma.documentSpace.findMany({
      where: {
        deletedAt: null,
        accessRules: { some: { group: { name: { in: groups }, active: true }, [permission]: true } },
      },
      include: {
        accessRules: {
          where: { group: { name: { in: groups }, active: true } },
        },
      },
      orderBy: { slug: 'asc' },
    }) as Promise<SpaceWithRule[]>;
  }

  async can(groups: string[], spaceId: string, permission: 'read' | 'search' | 'preview' | 'download') {
    return (await this.prisma.accessRule.count({
      where: { spaceId, group: { name: { in: groups }, active: true }, [permission]: true },
    })) > 0;
  }
}

