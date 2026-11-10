import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AlertDeliveryService } from "./alert-delivery.service";
import { AuditService } from "./audit.service";
import { AuthorizationService } from "./authorization.service";
import { DirectoryService } from "./directory.service";
import { portalLink } from "./notification-email";
import { PrismaService } from "./prisma.service";
import { AdminOnly, isAdminIdentity } from "./security";
import type { IsmsRequest } from "./types";

const DAY = 86_400_000;
const MAX_CUSTOM_DAYS = 365 * 5;
const REMINDER_WINDOW = 2 * DAY;
export const shareDurations = [
  "24h",
  "7d",
  "30d",
  "90d",
  "lifetime",
  "custom",
] as const;
const durationDays: Record<string, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const normalizeIdentity = (value: string) => value.trim().toLowerCase();

// A share is valid until revoked and, unless it is a lifetime share, until it expires.
const GROUP_RECIPIENT_PREFIX = "ad-group:";
const groupRecipient = (name: string) =>
  `${GROUP_RECIPIENT_PREFIX}${normalizeIdentity(name)}`;

export const activeShareWhere = (
  identity: string,
  now = new Date(),
  groups: string[] = [],
) => ({
  recipient: groups.length
    ? { in: [normalizeIdentity(identity), ...groups.map(groupRecipient)] }
    : normalizeIdentity(identity),
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

export async function isSensitiveDepositor(
  prisma: PrismaService,
  identity: string,
) {
  return Boolean(
    await prisma.sensitiveDepositor.findFirst({
      where: { identity: normalizeIdentity(identity), revokedAt: null },
      select: { id: true },
    }),
  );
}

export async function assertSensitiveDepositor(
  prisma: PrismaService,
  identity: string,
) {
  if (!(await isSensitiveDepositor(prisma, identity)))
    throw new ForbiddenException(
      "Only designated users can create or share sensitive documents",
    );
}

// Administrators and designated users may create sensitive documents or change the flag.
export async function assertCanMarkSensitive(
  prisma: PrismaService,
  req: IsmsRequest,
) {
  if (isAdminIdentity(req.identity.groups)) return;
  await assertSensitiveDepositor(prisma, req.identity.username);
}

export async function hasSensitiveShare(
  prisma: PrismaService,
  documentId: string,
  identity: string,
  groups: string[] = [],
) {
  return Boolean(
    await prisma.sensitiveShare.findFirst({
      where: { documentId, ...activeShareWhere(identity, new Date(), groups) },
      select: { id: true },
    }),
  );
}

// Space read/download ACLs alone never grant access to a sensitive document.
export async function sensitiveDocumentAccess(
  prisma: PrismaService,
  authorization: AuthorizationService,
  req: IsmsRequest,
  document: {
    id: string;
    spaceId: string;
    categoryId?: string | null;
    status: string;
  },
) {
  const rights = await Promise.all(
    (["edit", "publish", "archive"] as const).map((permission) =>
      authorization.can(
        req.identity.groups,
        document.spaceId,
        permission,
        document.categoryId ?? null,
      ),
    ),
  );
  const manage = rights.some(Boolean);
  const shared =
    !manage &&
    document.status === "PUBLISHED" &&
    (await hasSensitiveShare(
      prisma,
      document.id,
      req.identity.username,
      req.identity.groups,
    ));
  return { manage, shared };
}

export const expiryLabel = (expiresAt: Date | null) =>
  expiresAt
    ? `until ${expiresAt.toISOString().replace("T", " ").slice(0, 16)} UTC`
    : "with no expiry date (until revoked)";

async function mailFor(directory: DirectoryService, identity: string) {
  if (identity.startsWith(GROUP_RECIPIENT_PREFIX)) {
    const name = identity.slice(GROUP_RECIPIENT_PREFIX.length);
    const groups = (await directory.searchGroups(name)).filter(
      (group) => normalizeIdentity(group.name) === name,
    );
    if (groups.length !== 1) return [];
    return directory.emailsForGroup(
      groups[0].distinguishedName,
      groups[0].connectionId,
    );
  }
  if (identity.includes("@")) return [identity];
  return directory.emailsForIdentities([identity]);
}

export async function sendSensitiveMail(
  alerts: AlertDeliveryService,
  directory: DirectoryService,
  identity: string,
  subject: string,
  text: string,
  link: string,
) {
  try {
    const addresses = await mailFor(directory, identity);
    if (!addresses.length) return false;
    let delivered = true;
    for (const address of addresses) {
      try {
        await alerts.sendPreferredTo(
          [address],
          subject,
          text,
          link,
          "sensitive",
        );
      } catch {
        delivered = false;
      }
    }
    return delivered;
  } catch {
    return false;
  }
}

// Sends one reminder per share shortly before it expires; run by the worker.
export async function remindExpiringSensitiveShares(
  prisma: PrismaService,
  alerts: AlertDeliveryService,
  directory: DirectoryService,
) {
  const now = new Date();
  const due = await prisma.sensitiveShare.findMany({
    where: {
      revokedAt: null,
      reminderSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW) },
      document: { deletedAt: null, sensitive: true, status: "PUBLISHED" },
    },
    select: {
      id: true,
      recipient: true,
      expiresAt: true,
      document: {
        select: {
          slug: true,
          translations: { select: { title: true }, take: 1 },
        },
      },
    },
    take: 50,
  });
  let sent = 0;
  for (const share of due) {
    const claimed = await prisma.sensitiveShare.updateMany({
      where: {
        id: share.id,
        reminderSentAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        document: { deletedAt: null, sensitive: true, status: "PUBLISHED" },
      },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    const title = share.document.translations[0]?.title || share.document.slug;
    const delivered = await sendSensitiveMail(
      alerts,
      directory,
      share.recipient,
      "[ISMS Portal] Sensitive document access expires soon",
      `Your access to the sensitive document "${title}" expires ${expiryLabel(share.expiresAt)}.\n\nIf you still need it, ask the person who shared it with you to extend your access.`,
      portalLink(`/documents/${encodeURIComponent(share.document.slug)}`),
    );
    if (delivered) sent += 1;
    else
      await prisma.sensitiveShare.updateMany({
        where: { id: share.id, reminderSentAt: now },
        data: { reminderSentAt: null },
      });
  }
  return sent;
}

export class DepositorDto {
  @IsString() @MinLength(3) @MaxLength(254) identity!: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
}

export class ShareDto {
  @IsString() @MinLength(3) @MaxLength(254) recipient!: string;
  @IsOptional() @IsIn(["user", "group"]) recipientType?: "user" | "group";
  @IsIn(shareDurations) duration!: (typeof shareDurations)[number];
  @IsOptional() @IsISO8601() expiresAt?: string;
}

const resolveExpiry = (body: ShareDto): Date | null => {
  if (body.duration === "lifetime") return null;
  const now = Date.now();
  if (body.duration === "custom") {
    const date = body.expiresAt ? new Date(body.expiresAt) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.getTime() <= now)
      throw new BadRequestException("A future expiry date is required");
    if (date.getTime() > now + MAX_CUSTOM_DAYS * DAY)
      throw new BadRequestException("Expiry date is too far in the future");
    return date;
  }
  return new Date(now + durationDays[body.duration] * DAY);
};

const shareRow = (share: {
  id: string;
  recipient: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}) => ({
  id: share.id,
  recipient: share.recipient.startsWith(GROUP_RECIPIENT_PREFIX)
    ? share.recipient.slice(GROUP_RECIPIENT_PREFIX.length)
    : share.recipient,
  recipientType: share.recipient.startsWith(GROUP_RECIPIENT_PREFIX)
    ? "group"
    : "user",
  createdBy: share.createdBy,
  createdAt: share.createdAt,
  expiresAt: share.expiresAt,
  state: share.revokedAt
    ? "revoked"
    : share.expiresAt && share.expiresAt <= new Date()
      ? "expired"
      : "active",
});

@Controller("sensitive")
export class SensitiveController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly authorization: AuthorizationService,
    private readonly alerts: AlertDeliveryService,
    private readonly directory: DirectoryService,
  ) {}

  @Get("me")
  async me(@Req() req: IsmsRequest) {
    const depositor = await isSensitiveDepositor(
      this.prisma,
      req.identity.username,
    );
    return {
      depositor,
      canMark: depositor || isAdminIdentity(req.identity.groups),
    };
  }

  // Recipient suggestions for designated users: names and emails only.
  @Get("directory-users")
  async directoryUsers(@Req() req: IsmsRequest, @Query("q") q = "") {
    await assertSensitiveDepositor(this.prisma, req.identity.username);
    if (typeof q !== "string" || q.trim().length < 2) return [];
    const users = await this.directory.searchUsers(q);
    return users
      .filter((user) => user.email)
      .slice(0, 8)
      .map((user) => ({ displayName: user.displayName, email: user.email }));
  }

  @Get("directory-groups")
  async directoryGroups(@Req() req: IsmsRequest, @Query("q") q = "") {
    await assertSensitiveDepositor(this.prisma, req.identity.username);
    if (typeof q !== "string" || q.trim().length < 2) return [];
    return (await this.directory.searchGroups(q))
      .slice(0, 8)
      .map((group) => ({ name: group.name }));
  }

  // Sensitive documents currently shared with the caller.
  @Get("shared-with-me")
  async sharedWithMe(@Req() req: IsmsRequest) {
    const rows = await this.prisma.sensitiveShare.findMany({
      where: {
        ...activeShareWhere(
          req.identity.username,
          new Date(),
          req.identity.groups,
        ),
        document: { deletedAt: null, status: "PUBLISHED", sensitive: true },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        expiresAt: true,
        document: {
          select: {
            slug: true,
            translations: { select: { locale: true, title: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.document.slug,
      expiresAt: row.expiresAt,
      translations: row.document.translations,
    }));
  }

  private async sharableDocument(req: IsmsRequest, id: string) {
    await assertSensitiveDepositor(this.prisma, req.identity.username);
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, sensitive: true, status: "PUBLISHED" },
      select: {
        id: true,
        slug: true,
        spaceId: true,
        categoryId: true,
        translations: { select: { title: true }, take: 1 },
      },
    });
    const access = document
      ? await sensitiveDocumentAccess(this.prisma, this.authorization, req, {
          ...document,
          status: "PUBLISHED",
        })
      : null;
    const allowed = access && (access.manage || access.shared);
    if (!document || !allowed) throw new NotFoundException();
    return document;
  }

  @Get("documents/:id/shares")
  async shares(@Req() req: IsmsRequest, @Param("id") id: string) {
    await this.sharableDocument(req, id);
    const rows = await this.prisma.sensitiveShare.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map(shareRow);
  }

  @Post("documents/:id/shares")
  async share(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ShareDto,
  ) {
    const document = await this.sharableDocument(req, id);
    let recipient = normalizeIdentity(body.recipient);
    if (body.recipientType === "group") {
      if (recipient.length > 120)
        throw new BadRequestException("AD group name is too long");
      const groups = (await this.directory.searchGroups(recipient)).filter(
        (group) => normalizeIdentity(group.name) === recipient,
      );
      if (groups.length !== 1)
        throw new BadRequestException("Select one unambiguous AD group");
      recipient = groupRecipient(groups[0].name);
    } else if (
      /\s/u.test(recipient) ||
      recipient.startsWith(GROUP_RECIPIENT_PREFIX)
    )
      throw new BadRequestException("Invalid recipient");
    if (recipient === normalizeIdentity(req.identity.username))
      throw new BadRequestException("You already have access to this document");
    const expiresAt = resolveExpiry(body);
    // A new share replaces the previous active one for the same person.
    const share = await this.prisma.$transaction(async (tx) => {
      await tx.sensitiveShare.updateMany({
        where: { documentId: id, recipient, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.sensitiveShare.create({
        data: {
          documentId: id,
          recipient,
          createdBy: req.identity.username,
          expiresAt,
        },
      });
    });
    await this.audit.record(
      req,
      "sensitive.share.create",
      `document:${id}`,
      "success",
      { recipient, expiresAt: expiresAt?.toISOString() ?? "lifetime" },
    );
    const title = document.translations[0]?.title || document.slug;
    const sender = req.identity.displayName || req.identity.username;
    const emailSent = await sendSensitiveMail(
      this.alerts,
      this.directory,
      recipient,
      `[ISMS Portal] ${sender} shared a sensitive document with you`,
      `${sender} gave you read-only access to the sensitive document "${title}", ${expiryLabel(expiresAt)}.\n\nSign in to ISMS Portal with your own account to read it. Your access is personal, logged and watermarked: do not copy, forward or share the content.`,
      portalLink(`/documents/${encodeURIComponent(document.slug)}`),
    );
    return { ...shareRow(share), emailSent };
  }

  @Delete("shares/:shareId")
  async revoke(@Req() req: IsmsRequest, @Param("shareId") shareId: string) {
    await assertSensitiveDepositor(this.prisma, req.identity.username);
    const share = await this.prisma.sensitiveShare.findUnique({
      where: { id: shareId },
    });
    if (!share) throw new NotFoundException();
    if (
      normalizeIdentity(share.createdBy) !==
      normalizeIdentity(req.identity.username)
    )
      await this.sharableDocument(req, share.documentId);
    await this.prisma.sensitiveShare.updateMany({
      where: { id: share.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(
      req,
      "sensitive.share.revoke",
      `document:${share.documentId}`,
      "success",
      { shareId },
    );
    return { revoked: true };
  }
}

@AdminOnly()
@Controller("admin/sensitive")
export class SensitiveAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: AlertDeliveryService,
    private readonly directory: DirectoryService,
  ) {}

  @Get("depositors")
  depositors() {
    return this.prisma.sensitiveDepositor.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  @Post("depositors")
  async addDepositor(@Req() req: IsmsRequest, @Body() body: DepositorDto) {
    const identity = normalizeIdentity(body.identity);
    if (/\s/u.test(identity)) throw new BadRequestException("Invalid identity");
    const depositor = await this.prisma.sensitiveDepositor.upsert({
      where: { identity },
      update: {
        revokedAt: null,
        displayName: body.displayName?.trim() || undefined,
      },
      create: {
        identity,
        displayName: body.displayName?.trim() || null,
        addedBy: req.identity.username,
      },
    });
    await this.audit.record(
      req,
      "sensitive.depositor.add",
      `sensitive-depositor:${depositor.id}`,
      "success",
      { identity },
    );
    const emailSent = await sendSensitiveMail(
      this.alerts,
      this.directory,
      identity,
      "[ISMS Portal] You can now create and share sensitive documents",
      "An ISMS administrator authorised you to create sensitive documents and to share them with named colleagues in ISMS Portal.\n\nYou choose who can read each document and for how long: a fixed period, a precise date, or for life. You can revoke access at any time. Every access is logged and watermarked.\n\nHandle these documents carefully and only share them with people who need to know.",
      portalLink("/"),
    );
    return { ...depositor, emailSent };
  }

  @Delete("depositors/:id")
  async removeDepositor(@Req() req: IsmsRequest, @Param("id") id: string) {
    const result = await this.prisma.sensitiveDepositor.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException();
    await this.audit.record(
      req,
      "sensitive.depositor.remove",
      `sensitive-depositor:${id}`,
      "success",
    );
    return { removed: true };
  }

  @Get("shares")
  async shares() {
    const rows = await this.prisma.sensitiveShare.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        document: {
          select: {
            id: true,
            slug: true,
            translations: { select: { title: true }, take: 1 },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...shareRow(row),
      documentId: row.document.id,
      title: row.document.translations[0]?.title || row.document.slug,
    }));
  }

  @Delete("shares/:id")
  async revoke(@Req() req: IsmsRequest, @Param("id") id: string) {
    const share = await this.prisma.sensitiveShare.findUnique({
      where: { id },
    });
    if (!share) throw new NotFoundException();
    await this.prisma.sensitiveShare.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(
      req,
      "sensitive.share.revoke",
      `document:${share.documentId}`,
      "success",
      { shareId: id },
    );
    return { revoked: true };
  }
}
