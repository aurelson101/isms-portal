import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { PrismaService } from "./prisma.service";
import { AuthorizationService, type Permission } from "./authorization.service";
import { AuditService } from "./audit.service";
import { notifySubscribers, persistAudit } from "./audit-event";
import { isAdminIdentity } from "./security";
import { sensitiveDocumentAccess } from "./sensitive-sharing";
import type { IsmsRequest } from "./types";
import { versionLabel } from "./version-label";
import {
  gedFeatures,
  requireGedFeature,
  sharingSettings,
} from "./ged-settings";

const DOCUMENT_LINK_TYPES = ["SUPERSEDES", "ANNEX", "RELATED"] as const;
const LOCK_HOURS = 8;

class SubscriptionDto {
  @IsBoolean() subscribed!: boolean;
}
class CommentDto {
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsUUID("4") versionId?: string;
  @IsOptional() @IsInt() @Min(1) page?: number;
}
class LinkDto {
  // Target document id, slug or portal URL (/documents/<slug>).
  @IsString() @MinLength(1) @MaxLength(500) target!: string;
  @IsIn(DOCUMENT_LINK_TYPES) type!: (typeof DOCUMENT_LINK_TYPES)[number];
}
class RestoreVersionDto {
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** True when another person holds a still-valid edit lock. */
export const lockedByOther = (
  document: { lockedBy: string | null; lockExpiresAt: Date | null },
  identity: string,
  now = new Date(),
) =>
  Boolean(
    document.lockedBy &&
      document.lockedBy !== identity &&
      document.lockExpiresAt &&
      document.lockExpiresAt > now,
  );

export async function assertNotLockedByOther(
  prisma: PrismaService,
  documentId: string,
  identity: string,
) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { lockedBy: true, lockExpiresAt: true },
  });
  if (document && lockedByOther(document, identity))
    throw new ConflictException(
      `Document locked for editing by ${document.lockedBy} until ${document.lockExpiresAt!.toISOString()}`,
    );
}

/** Same visibility rule as the reader: published needs read, others need management. */
export async function visibleDocument(
  prisma: PrismaService,
  authorization: AuthorizationService,
  req: IsmsRequest,
  id: string,
) {
  const document = await prisma.document.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      spaceId: true,
      categoryId: true,
      status: true,
      sensitive: true,
      lockedBy: true,
      lockedAt: true,
      lockExpiresAt: true,
    },
  });
  if (!document) return null;
  const can = (permission: Permission) =>
    authorization.can(
      req.identity.groups,
      document.spaceId,
      permission,
      document.categoryId,
    );
  const sensitiveAccess = document.sensitive
    ? await sensitiveDocumentAccess(prisma, authorization, req, document)
    : null;
  const allowed = sensitiveAccess
    ? sensitiveAccess.manage || sensitiveAccess.shared
    : document.status === "PUBLISHED"
      ? await can("read")
      : (
          await Promise.all((["edit", "publish", "archive"] as const).map(can))
        ).some(Boolean);
  return allowed ? document : null;
}

@Controller("documents")
export class GedDocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private can(
    req: IsmsRequest,
    document: { spaceId: string; categoryId: string | null },
    permission: Permission,
  ) {
    return this.authorization.can(
      req.identity.groups,
      document.spaceId,
      permission,
      document.categoryId,
    );
  }

  private visible(req: IsmsRequest, id: string) {
    return visibleDocument(this.prisma, this.authorization, req, id);
  }

  private async requireVisible(req: IsmsRequest, id: string) {
    const document = await this.visible(req, id);
    if (!document) throw new NotFoundException();
    return document;
  }

  private async requireEditable(req: IsmsRequest, id: string) {
    const document = await this.requireVisible(req, id);
    if (!(await this.can(req, document, "edit"))) throw new NotFoundException();
    return document;
  }

  @Get(":id/ged")
  async panel(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.requireVisible(req, id);
    const canEdit = await this.can(req, document, "edit");
    const [features, sharing] = await Promise.all([
      gedFeatures(this.prisma),
      sharingSettings(this.prisma),
    ]);
    const [subscription, comments, outgoing, incoming, versions] =
      await Promise.all([
        this.prisma.documentSubscription.findUnique({
          where: {
            identity_documentId: {
              identity: req.identity.username,
              documentId: id,
            },
          },
        }),
        features.comments
          ? this.prisma.documentComment.findMany({
              where: { documentId: id, deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 200,
            })
          : Promise.resolve([]),
        features.links
          ? this.prisma.documentLink.findMany({
              where: { sourceId: id },
              include: { target: { include: { translations: true } } },
            })
          : Promise.resolve([]),
        features.links
          ? this.prisma.documentLink.findMany({
              where: { targetId: id },
              include: { source: { include: { translations: true } } },
            })
          : Promise.resolve([]),
        canEdit
          ? this.prisma.documentVersion.findMany({
              where: { documentId: id },
              orderBy: [{ locale: "asc" }, { version: "desc" }],
              select: {
                id: true,
                locale: true,
                version: true,
                versionMajor: true,
                versionMinor: true,
                createdAt: true,
                changeSummary: true,
                content: { select: { status: true, ocr: true } },
                storedFile: {
                  select: {
                    originalName: true,
                    sha256: true,
                    purgedAt: true,
                    timestamp: { select: { genTime: true, tsaUrl: true } },
                    scans: {
                      orderBy: { scannedAt: "desc" },
                      take: 1,
                      select: { status: true },
                    },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);
    // Linked documents are only listed when the reader may see them.
    const linked = async (
      link: { id: string; type: string; createdAt: Date },
      other: {
        id: string;
        slug: string;
        deletedAt: Date | null;
        translations: Array<{ locale: string; title: string }>;
      },
      direction: "outgoing" | "incoming",
    ) =>
      !other.deletedAt && (await this.visible(req, other.id))
        ? {
            id: link.id,
            type: link.type,
            direction,
            createdAt: link.createdAt,
            document: {
              id: other.id,
              slug: other.slug,
              translations: other.translations.map(({ locale, title }) => ({
                locale,
                title,
              })),
            },
          }
        : null;
    const links = (
      await Promise.all([
        ...outgoing.map((link) => linked(link, link.target, "outgoing")),
        ...incoming.map((link) => linked(link, link.source, "incoming")),
      ])
    ).filter(Boolean);
    const lockActive = Boolean(
      document.lockedBy &&
        document.lockExpiresAt &&
        document.lockExpiresAt > new Date(),
    );
    const admin = isAdminIdentity(req.identity.groups);
    return {
      features: { ...features, sharing: sharing.enabled },
      subscribed: Boolean(subscription),
      canEdit,
      isAdmin: admin,
      lock: lockActive
        ? {
            lockedBy: document.lockedBy,
            lockedAt: document.lockedAt,
            lockExpiresAt: document.lockExpiresAt,
            mine: document.lockedBy === req.identity.username,
          }
        : null,
      links,
      comments: comments.map((comment) => ({
        ...comment,
        canDelete: admin || comment.author === req.identity.username,
      })),
      versions: versions.map((version) => ({
        id: version.id,
        locale: version.locale,
        version: version.version,
        label: versionLabel(version),
        createdAt: version.createdAt,
        changeSummary: version.changeSummary,
        fileName: version.storedFile.originalName,
        sha256: version.storedFile.sha256,
        purged: Boolean(version.storedFile.purgedAt),
        clean: version.storedFile.scans[0]?.status === "CLEAN",
        timestampedAt: version.storedFile.timestamp?.genTime ?? null,
        indexed: version.content?.status ?? null,
        ocr: version.content?.ocr ?? false,
      })),
    };
  }

  @Put(":id/subscription")
  async subscribe(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: SubscriptionDto,
  ) {
    await this.requireVisible(req, id);
    const key = { identity: req.identity.username, documentId: id };
    if (body.subscribed)
      await this.prisma.documentSubscription.upsert({
        where: { identity_documentId: key },
        create: key,
        update: {},
      });
    else await this.prisma.documentSubscription.deleteMany({ where: key });
    return { subscribed: body.subscribed };
  }

  @Post(":id/comments")
  async comment(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: CommentDto,
  ) {
    await requireGedFeature(this.prisma, "comments");
    await this.requireVisible(req, id);
    if (
      body.versionId &&
      !(await this.prisma.documentVersion.findFirst({
        where: { id: body.versionId, documentId: id },
        select: { id: true },
      }))
    )
      throw new BadRequestException("Unknown document version");
    const text = body.body.trim();
    if (!text) throw new BadRequestException("A comment is required");
    const [comment, event] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.documentComment.create({
        data: {
          documentId: id,
          versionId: body.versionId ?? null,
          page: body.page ?? null,
          author: req.identity.username,
          body: text,
        },
      });
      await notifySubscribers(
        tx,
        id,
        req.identity.username,
        "Nouveau commentaire",
        `${req.identity.displayName || req.identity.username} a commenté`,
      );
      const audit = await persistAudit(
        tx,
        req,
        "document.comment.create",
        `document:${id}`,
        "success",
        { commentId: created.id, page: created.page },
        false,
      );
      return [created, audit] as const;
    });
    await this.audit.committed(event);
    return { ...comment, canDelete: true };
  }

  @Delete(":id/comments/:commentId")
  async deleteComment(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("commentId") commentId: string,
  ) {
    await requireGedFeature(this.prisma, "comments");
    await this.requireVisible(req, id);
    const comment = await this.prisma.documentComment.findFirst({
      where: { id: commentId, documentId: id, deletedAt: null },
    });
    if (!comment) throw new NotFoundException();
    if (
      comment.author !== req.identity.username &&
      !isAdminIdentity(req.identity.groups)
    )
      throw new ForbiddenException();
    await this.prisma.documentComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    await this.audit.record(
      req,
      "document.comment.delete",
      `document:${id}`,
      "success",
      { commentId },
      { notify: false },
    );
    return { deleted: true };
  }

  private async resolveTarget(value: string) {
    const trimmed = value.trim();
    const fromUrl = /\/documents\/([^/?#]+)/u.exec(trimmed)?.[1];
    const key = decodeURIComponent(fromUrl || trimmed);
    return this.prisma.document.findFirst({
      where: {
        deletedAt: null,
        OR: [
          ...(uuidPattern.test(key) ? [{ id: key }] : []),
          { slug: key },
          { metadata: { path: ["ged.reference"], equals: key } },
        ],
      },
      select: { id: true },
    });
  }

  @Post(":id/links")
  async link(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: LinkDto,
  ) {
    await requireGedFeature(this.prisma, "links");
    await this.requireEditable(req, id);
    const target = await this.resolveTarget(body.target);
    if (!target || !(await this.visible(req, target.id)))
      throw new BadRequestException("Target document not found");
    if (target.id === id)
      throw new BadRequestException("A document cannot link to itself");
    const existing = await this.prisma.documentLink.findUnique({
      where: {
        sourceId_targetId_type: {
          sourceId: id,
          targetId: target.id,
          type: body.type,
        },
      },
    });
    if (existing) return existing;
    const created = await this.prisma.documentLink.create({
      data: {
        sourceId: id,
        targetId: target.id,
        type: body.type,
        createdBy: req.identity.username,
      },
    });
    await this.audit.record(
      req,
      "document.link.create",
      `document:${id}`,
      "success",
      { targetId: target.id, type: body.type },
      { notify: false },
    );
    return created;
  }

  @Delete(":id/links/:linkId")
  async unlink(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("linkId") linkId: string,
  ) {
    await requireGedFeature(this.prisma, "links");
    await this.requireEditable(req, id);
    const removed = await this.prisma.documentLink.deleteMany({
      where: { id: linkId, sourceId: id },
    });
    if (removed.count !== 1) throw new NotFoundException();
    await this.audit.record(
      req,
      "document.link.delete",
      `document:${id}`,
      "success",
      { linkId },
      { notify: false },
    );
    return { deleted: true };
  }

  @Post(":id/lock")
  async lock(@Req() req: IsmsRequest, @Param("id") id: string) {
    await this.requireEditable(req, id);
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + LOCK_HOURS * 3600_000);
    // Atomic check-out: free, expired, or already mine (renewal).
    const locked = await this.prisma.document.updateMany({
      where: {
        id,
        deletedAt: null,
        OR: [
          { lockedBy: null },
          { lockExpiresAt: { lte: now } },
          { lockedBy: req.identity.username },
        ],
      },
      data: { lockedBy: req.identity.username, lockedAt: now, lockExpiresAt },
    });
    if (locked.count !== 1)
      await assertNotLockedByOther(this.prisma, id, req.identity.username);
    await this.audit.record(
      req,
      "document.lock",
      `document:${id}`,
      "success",
      { lockExpiresAt },
      { notify: false },
    );
    return {
      lockedBy: req.identity.username,
      lockedAt: now,
      lockExpiresAt,
      mine: true,
    };
  }

  @Delete(":id/lock")
  async unlock(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.requireEditable(req, id);
    if (
      lockedByOther(document, req.identity.username) &&
      !isAdminIdentity(req.identity.groups)
    )
      throw new ForbiddenException(
        "Only the lock owner or an administrator can unlock",
      );
    await this.prisma.document.update({
      where: { id },
      data: { lockedBy: null, lockedAt: null, lockExpiresAt: null },
    });
    await this.audit.record(
      req,
      "document.unlock",
      `document:${id}`,
      "success",
      { previousOwner: document.lockedBy },
      { notify: false },
    );
    return { unlocked: true };
  }

  @Post(":id/versions/:versionId/restore")
  async restoreVersion(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() body: RestoreVersionDto,
  ) {
    await this.requireEditable(req, id);
    await assertNotLockedByOther(this.prisma, id, req.identity.username);
    const source = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId: id },
      include: {
        content: true,
        storedFile: {
          include: { scans: { orderBy: { scannedAt: "desc" }, take: 1 } },
        },
      },
    });
    if (!source) throw new NotFoundException();
    if (
      source.storedFile.purgedAt ||
      source.storedFile.scans[0]?.status !== "CLEAN"
    )
      throw new ConflictException("This version cannot be restored");
    const [restored, event] = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.documentVersion.findFirst({
        where: { documentId: id, locale: source.locale },
        orderBy: { version: "desc" },
        select: { version: true, versionMajor: true, versionMinor: true },
      });
      if (latest?.version === source.version)
        throw new ConflictException("This version is already the current one");
      const created = await tx.documentVersion.create({
        data: {
          documentId: id,
          locale: source.locale,
          version: (latest?.version || 0) + 1,
          versionMajor: latest?.versionMajor ?? 0,
          versionMinor: (latest?.versionMinor ?? 0) + 1,
          storedFileId: source.storedFileId,
          changeSummary:
            body.changeSummary?.trim() ||
            `Restauration de la version ${source.versionMajor}.${source.versionMinor}`,
          changeDetails: {
            added: [],
            removed: [],
            modified: [],
            restoredFromVersion: source.version,
          },
        },
      });
      if (source.content?.status === "DONE")
        await tx.documentVersionContent.create({
          data: {
            versionId: created.id,
            status: "DONE",
            text: source.content.text,
            ocr: source.content.ocr,
            extractedAt: new Date(),
          },
        });
      // Like an upload, the restored content must be published again.
      await tx.document.update({ where: { id }, data: { status: "DRAFT" } });
      const audit = await persistAudit(
        tx,
        req,
        "document.version.restore",
        `document:${id}`,
        "success",
        {
          locale: source.locale,
          restoredFromVersion: source.version,
          newVersion: created.version,
          sha256: source.storedFile.sha256,
        },
      );
      return [created, audit] as const;
    });
    await this.audit.committed(event);
    return restored;
  }
}
