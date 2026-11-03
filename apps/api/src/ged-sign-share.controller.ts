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
  Req,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { extname } from "node:path";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import { StorageService } from "./storage.service";
import { CryptoService } from "./crypto.service";
import { persistAudit } from "./audit-event";
import { isAdminIdentity } from "./security";
import { isMipObjectKey } from "./mip-reader";
import {
  loadTimestampConfig,
  requireGedFeature,
  sharingSettings,
} from "./ged-settings";
import { requestTimestamp } from "./timestamp";
import { visibleDocument } from "./ged.controller";
import { versionLabel } from "./version-label";
import type { IsmsRequest } from "./types";

class SignatureRequestDto {
  @IsUUID("4") versionId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Matches(/^[^\s<>"]{3,200}$/u, { each: true })
  signers!: string[];
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}
class SignatureDecisionDto {
  @IsIn(["SIGN", "DECLINE"]) decision!: "SIGN" | "DECLINE";
  // The signer explicitly confirms intent to sign this exact version.
  @IsBoolean() consent!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class ShareDto {
  @IsUUID("4") versionId!: string;
  @IsInt() @Min(1) @Max(90) expiresInDays!: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxDownloads?: number;
}

const stable = (value: Record<string, unknown>) =>
  JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
// Helvetica (WinAnsi) cannot encode every character; keep the certificate readable.
const pdfText = (value: string) =>
  value.replace(/[^\x20-\x7E\u00A0-\u00FF\u2019\u2013\u2014]/gu, "?");
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const attachmentName = (name: string) => {
  const ascii = name.replace(/[^\x20-\x7E]/gu, "_").replace(/["\\]/gu, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

@Controller("documents")
export class GedSignShareController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  private async requireVisible(req: IsmsRequest, id: string) {
    const document = await visibleDocument(
      this.prisma,
      this.authorization,
      req,
      id,
    );
    if (!document) throw new NotFoundException();
    return document;
  }

  private async can(
    req: IsmsRequest,
    document: { spaceId: string; categoryId: string | null },
    permission: "edit" | "download",
  ) {
    return this.authorization.can(
      req.identity.groups,
      document.spaceId,
      permission,
      document.categoryId,
    );
  }

  private async cleanVersion(documentId: string, versionId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: {
        storedFile: {
          include: { scans: { orderBy: { scannedAt: "desc" }, take: 1 } },
        },
      },
    });
    if (
      !version ||
      version.storedFile.purgedAt ||
      version.storedFile.scans[0]?.status !== "CLEAN"
    )
      throw new BadRequestException("Unknown or unavailable document version");
    return version;
  }

  // ---- Simple electronic signatures -------------------------------------

  @Get(":id/signatures")
  async signatures(@Req() req: IsmsRequest, @Param("id") id: string) {
    await requireGedFeature(this.prisma, "signatures");
    await this.requireVisible(req, id);
    const me = req.identity.username.toLowerCase();
    const admin = isAdminIdentity(req.identity.groups);
    const requests = await this.prisma.signatureRequest.findMany({
      where: { documentId: id },
      include: { entries: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const versions = await this.prisma.documentVersion.findMany({
      where: { id: { in: requests.map((request) => request.versionId) } },
      select: {
        id: true,
        locale: true,
        versionMajor: true,
        versionMinor: true,
      },
    });
    return requests.map((request) => {
      const version = versions.find((item) => item.id === request.versionId);
      return {
        id: request.id,
        status: request.status,
        requestedBy: request.requestedBy,
        message: request.message,
        createdAt: request.createdAt,
        completedAt: request.completedAt,
        version: version
          ? `${version.locale.toUpperCase()} v${versionLabel(version)}`
          : null,
        canCancel:
          request.status === "OPEN" &&
          (admin || request.requestedBy.toLowerCase() === me),
        entries: request.entries.map((entry) => ({
          signer: entry.signer,
          status: entry.status,
          decidedAt: entry.decidedAt,
          comment: entry.comment,
          timestamped: Boolean(entry.genTime),
          mine: entry.signer === me,
          canDecide:
            request.status === "OPEN" &&
            entry.status === "PENDING" &&
            entry.signer === me,
        })),
      };
    });
  }

  @Post(":id/signatures")
  async requestSignatures(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: SignatureRequestDto,
  ) {
    await requireGedFeature(this.prisma, "signatures");
    const document = await this.requireVisible(req, id);
    if (!(await this.can(req, document, "edit"))) throw new NotFoundException();
    await this.cleanVersion(id, body.versionId);
    const signers = [
      ...new Set(body.signers.map((signer) => signer.trim().toLowerCase())),
    ].filter(Boolean);
    if (!signers.length)
      throw new BadRequestException("Add at least one signer");
    const [request, event] = await this.prisma.$transaction(async (tx) => {
      const created = await tx.signatureRequest.create({
        data: {
          documentId: id,
          versionId: body.versionId,
          requestedBy: req.identity.username,
          message: body.message?.trim() || null,
          entries: {
            create: signers.map((signer, position) => ({ signer, position })),
          },
        },
      });
      await tx.userNotification.createMany({
        data: signers.map((identity) => ({
          identity,
          title: "Signature demandée",
          message: `${req.identity.displayName || req.identity.username} vous demande de signer un document`,
          mandatory: true,
          resourceType: "document",
          resourceId: id,
        })),
      });
      const audit = await persistAudit(
        tx,
        req,
        "document.signature.request",
        `document:${id}`,
        "success",
        { requestId: created.id, versionId: body.versionId, signers },
        false,
      );
      return [created, audit] as const;
    });
    await this.audit.committed(event);
    return request;
  }

  @Post(":id/signatures/:requestId/decision")
  async decide(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @Body() body: SignatureDecisionDto,
  ) {
    await requireGedFeature(this.prisma, "signatures");
    await this.requireVisible(req, id);
    if (body.decision === "SIGN" && !body.consent)
      throw new BadRequestException("Signing requires explicit consent");
    const me = req.identity.username.toLowerCase();
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, documentId: id, status: "OPEN" },
      include: { entries: true },
    });
    const entry = request?.entries.find(
      (item) => item.signer === me && item.status === "PENDING",
    );
    if (!request || !entry) throw new NotFoundException();
    const version = await this.cleanVersion(id, request.versionId);
    const decidedAt = new Date();
    const status = body.decision === "SIGN" ? "SIGNED" : "DECLINED";
    const evidenceHash = createHash("sha256")
      .update(
        stable({
          requestId,
          documentId: id,
          versionId: version.id,
          fileSha256: version.storedFile.sha256,
          signer: me,
          status,
          decidedAt: decidedAt.toISOString(),
          ipAddress: req.ip || "unknown",
        }),
      )
      .digest("hex");
    // A qualified time-stamp strengthens the evidence; it is optional.
    const timestamp = await loadTimestampConfig(this.prisma, this.crypto)
      .then((config) => requestTimestamp(evidenceHash, config))
      .catch(() => null);
    const event = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.signatureEntry.updateMany({
        where: { id: entry.id, status: "PENDING" },
        data: {
          status,
          decidedAt,
          comment: body.comment?.trim() || null,
          ipAddress: req.ip || "unknown",
          evidenceHash,
          ...(timestamp
            ? { token: timestamp.token, genTime: timestamp.genTime }
            : {}),
        },
      });
      if (updated.count !== 1) throw new ConflictException("Already decided");
      const remaining = await tx.signatureEntry.count({
        where: { requestId, status: "PENDING" },
      });
      const requestStatus =
        status === "DECLINED"
          ? "DECLINED"
          : remaining === 0
            ? "COMPLETED"
            : "OPEN";
      if (requestStatus !== "OPEN")
        await tx.signatureRequest.update({
          where: { id: requestId },
          data: { status: requestStatus, completedAt: decidedAt },
        });
      if (requestStatus !== "OPEN" || status === "DECLINED")
        await tx.userNotification.create({
          data: {
            identity: request.requestedBy,
            title:
              requestStatus === "COMPLETED"
                ? "Signatures terminées"
                : "Signature refusée",
            message: `${me} : ${status === "SIGNED" ? "signé" : "refusé"}`,
            resourceType: "document",
            resourceId: id,
          },
        });
      return persistAudit(
        tx,
        req,
        status === "SIGNED"
          ? "document.signature.sign"
          : "document.signature.decline",
        `document:${id}`,
        "success",
        {
          requestId,
          versionId: version.id,
          fileSha256: version.storedFile.sha256,
          evidenceHash,
          timestamped: Boolean(timestamp),
        },
        false,
      );
    });
    await this.audit.committed(event);
    return { status, evidenceHash, timestamped: Boolean(timestamp) };
  }

  @Delete(":id/signatures/:requestId")
  async cancel(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
  ) {
    await requireGedFeature(this.prisma, "signatures");
    await this.requireVisible(req, id);
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, documentId: id, status: "OPEN" },
    });
    if (!request) throw new NotFoundException();
    if (
      request.requestedBy.toLowerCase() !==
        req.identity.username.toLowerCase() &&
      !isAdminIdentity(req.identity.groups)
    )
      throw new ForbiddenException();
    await this.prisma.signatureRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    await this.audit.record(
      req,
      "document.signature.cancel",
      `document:${id}`,
      "success",
      { requestId },
      { notify: false },
    );
    return { cancelled: true };
  }

  /** Signature certificate (evidence summary) for one request, as a PDF. */
  @Get(":id/signatures/:requestId/certificate")
  async certificate(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param("id") id: string,
    @Param("requestId") requestId: string,
  ) {
    await requireGedFeature(this.prisma, "signatures");
    await this.requireVisible(req, id);
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, documentId: id },
      include: {
        entries: { orderBy: { position: "asc" } },
        document: { include: { translations: true } },
      },
    });
    if (!request) throw new NotFoundException();
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: request.versionId },
      include: { storedFile: true },
    });
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 790;
    const line = (text: string, size = 10, strong = false) => {
      if (y < 60) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(pdfText(text).slice(0, 110), {
        x: 50,
        y,
        size,
        font: strong ? bold : font,
        color: rgb(0.03, 0.1, 0.22),
      });
      y -= size + 6;
    };
    line("Certificat de signature électronique simple", 16, true);
    line(`Signature certificate - ISMS Portal`, 10);
    y -= 8;
    line(
      `Document : ${request.document.translations[0]?.title || request.documentId}`,
      11,
      true,
    );
    line(`Identifiant : ${request.documentId}`);
    if (version) {
      line(
        `Version : ${version.locale.toUpperCase()} v${versionLabel(version)} (${version.storedFile.originalName})`,
      );
      line(`SHA-256 du fichier : ${version.storedFile.sha256}`);
    }
    line(
      `Demande : ${request.id} par ${request.requestedBy} le ${request.createdAt.toISOString()}`,
    );
    line(
      `Statut : ${request.status}${request.completedAt ? ` (${request.completedAt.toISOString()})` : ""}`,
    );
    if (request.message) line(`Message : ${request.message}`);
    y -= 8;
    for (const entry of request.entries) {
      line(`${entry.signer} - ${entry.status}`, 11, true);
      if (entry.decidedAt)
        line(
          `Date : ${entry.decidedAt.toISOString()} - adresse IP : ${entry.ipAddress || "-"}`,
        );
      if (entry.evidenceHash)
        line(`Empreinte de preuve : ${entry.evidenceHash}`);
      line(
        entry.genTime
          ? `Horodatage RFC 3161 : ${entry.genTime.toISOString()}`
          : "Horodatage RFC 3161 : non disponible",
      );
      if (entry.comment) line(`Commentaire : ${entry.comment}`);
      y -= 4;
    }
    y -= 8;
    line(
      "Signature électronique simple (eIDAS, art. 3.10) : identité issue de l'authentification",
      8,
    );
    line(
      "SSO de l'entreprise, consentement explicite, preuves chaînées dans le journal d'audit scellé.",
      8,
    );
    const bytes = Buffer.from(await pdf.save());
    response
      .type("application/pdf")
      .setHeader("Cache-Control", "no-store")
      .attachment(`signature-${request.id}.pdf`)
      .send(bytes);
  }

  // ---- External share links ---------------------------------------------

  @Get(":id/shares")
  async shares(@Req() req: IsmsRequest, @Param("id") id: string) {
    const document = await this.requireVisible(req, id);
    const settings = await sharingSettings(this.prisma);
    const canShare =
      settings.enabled &&
      document.status === "PUBLISHED" &&
      !document.sensitive &&
      (await this.can(req, document, "edit")) &&
      (await this.can(req, document, "download"));
    const links =
      canShare || (await this.can(req, document, "edit"))
        ? await this.prisma.shareLink.findMany({
            where: { documentId: id },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [];
    const now = new Date();
    return {
      enabled: settings.enabled,
      maxDays: settings.maxDays,
      canShare,
      reason: !settings.enabled
        ? "disabled"
        : document.status !== "PUBLISHED"
          ? "not-published"
          : document.sensitive
            ? "sensitive"
            : null,
      links: links.map((link) => ({
        id: link.id,
        createdBy: link.createdBy,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        maxDownloads: link.maxDownloads,
        downloadCount: link.downloadCount,
        revokedAt: link.revokedAt,
        active:
          !link.revokedAt &&
          link.expiresAt > now &&
          (link.maxDownloads === null ||
            link.downloadCount < link.maxDownloads),
      })),
    };
  }

  @Post(":id/shares")
  async share(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ShareDto,
  ) {
    const document = await this.requireVisible(req, id);
    const settings = await sharingSettings(this.prisma);
    if (!settings.enabled)
      throw new ForbiddenException("External sharing is disabled");
    if (
      !(await this.can(req, document, "edit")) ||
      !(await this.can(req, document, "download"))
    )
      throw new NotFoundException();
    if (document.status !== "PUBLISHED" || document.sensitive)
      throw new ConflictException(
        "Only published, non-sensitive documents can be shared externally",
      );
    if (body.expiresInDays > settings.maxDays)
      throw new BadRequestException(
        `Maximum duration: ${settings.maxDays} days`,
      );
    const version = await this.cleanVersion(id, body.versionId);
    if (isMipObjectKey(version.storedFile.objectKey))
      throw new ConflictException("Protected (MIP) files cannot be shared");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + body.expiresInDays * 86400000);
    const link = await this.prisma.shareLink.create({
      data: {
        documentId: id,
        versionId: version.id,
        tokenHash: tokenHash(token),
        createdBy: req.identity.username,
        expiresAt,
        maxDownloads: body.maxDownloads ?? null,
      },
    });
    await this.audit.record(
      req,
      "document.share.create",
      `document:${id}`,
      "success",
      {
        shareId: link.id,
        versionId: version.id,
        expiresAt,
        maxDownloads: link.maxDownloads,
      },
      { notify: false },
    );
    // The token is only returned once; the database keeps its hash.
    return { id: link.id, url: `/api/public/share/${token}`, expiresAt };
  }

  @Delete(":id/shares/:shareId")
  async revoke(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Param("shareId") shareId: string,
  ) {
    const document = await this.requireVisible(req, id);
    if (!(await this.can(req, document, "edit"))) throw new NotFoundException();
    const revoked = await this.prisma.shareLink.updateMany({
      where: { id: shareId, documentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new NotFoundException();
    await this.audit.record(
      req,
      "document.share.revoke",
      `document:${id}`,
      "success",
      { shareId },
      { notify: false },
    );
    return { revoked: true };
  }
}

/** Anonymous download through an external share token (nginx: no SSO). */
@Controller("public/share")
export class PublicShareController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get(":token")
  async download(
    @Req() req: IsmsRequest,
    @Res() response: Response,
    @Param("token") token: string,
  ) {
    if (!/^[A-Za-z0-9_-]{32,64}$/u.test(token)) throw new NotFoundException();
    const link = await this.prisma.shareLink.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { document: true },
    });
    if (!link) throw new NotFoundException();
    const settings = await sharingSettings(this.prisma);
    const version = await this.prisma.documentVersion.findUnique({
      where: { id: link.versionId },
      include: {
        storedFile: {
          include: { scans: { orderBy: { scannedAt: "desc" }, take: 1 } },
        },
      },
    });
    const now = new Date();
    const valid =
      settings.enabled &&
      !link.revokedAt &&
      link.expiresAt > now &&
      link.document.status === "PUBLISHED" &&
      !link.document.deletedAt &&
      !link.document.sensitive &&
      version &&
      !version.storedFile.purgedAt &&
      version.storedFile.scans[0]?.status === "CLEAN" &&
      !isMipObjectKey(version.storedFile.objectKey);
    // Consume one download atomically so the limit cannot be exceeded.
    const consumed = valid
      ? await this.prisma.$executeRaw`
          UPDATE "ShareLink" SET "downloadCount" = "downloadCount" + 1, "lastAccessAt" = now()
          WHERE id = ${link.id} AND "revokedAt" IS NULL
            AND ("maxDownloads" IS NULL OR "downloadCount" < "maxDownloads")`
      : 0;
    await this.audit
      .record(
        req,
        "document.share.download",
        `document:${link.documentId}`,
        consumed === 1 ? "success" : "denied",
        { shareId: link.id, ipAddress: req.ip || "unknown" },
        { notify: false },
      )
      .catch(() => undefined);
    if (consumed !== 1 || !version) throw new NotFoundException();
    const stream = await this.storage.getObject(version.storedFile.objectKey);
    response.setHeader("Content-Type", version.storedFile.mimeType);
    response.setHeader(
      "Content-Disposition",
      attachmentName(
        version.storedFile.originalName ||
          `document${extname(version.storedFile.objectKey)}`,
      ),
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; sandbox",
    );
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  }
}
