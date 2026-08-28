import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { createHash, randomUUID } from "crypto";
import { basename, extname } from "path";
import { AdminOnly } from "./security";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import { StorageService } from "./storage.service";
import { AntivirusService } from "./antivirus.service";
import type { IsmsRequest } from "./types";
import {
  AccessRequestDto,
  AlertPolicyDto,
  DocumentReportDto,
  DocumentAcknowledgementDto,
  ObservabilityOptionsDto,
  ReviewDto,
  SavedSearchDto,
  SecurityReportDto,
  UserPreferenceDto,
} from "./user-tools.dto";

const allowedFilterKeys = new Set([
  "q",
  "space",
  "categoryId",
  "format",
  "locale",
  "sensitive",
  "sort",
  "favorites",
]);

const securityAttachmentTypes: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".txt": ["text/plain"],
};

const validSecurityAttachmentMagic = (buffer: Buffer, extension: string) => {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (extension === ".png")
    return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if ([".jpg", ".jpeg"].includes(extension))
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  return extension === ".txt" && !buffer.includes(0);
};

@Controller("user-tools")
export class UserToolsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly antivirus: AntivirusService,
  ) {}

  @Get("recent")
  async recent(@Req() req: IsmsRequest) {
    const activities = await this.prisma.userDocumentActivity.findMany({
      where: { identity: req.identity.username },
      distinct: ["documentId"],
      orderBy: { occurredAt: "desc" },
      take: 20,
      include: {
        document: {
          select: {
            id: true,
            spaceId: true,
            status: true,
            translations: { select: { locale: true, title: true } },
          },
        },
      },
    });
    const readable = new Set(
      (
        await this.authorization.permittedSpaces(req.identity.groups, "read")
      ).map((space) => space.id),
    );
    return activities.filter(
      ({ document }) =>
        document.status === "PUBLISHED" && readable.has(document.spaceId),
    );
  }

  @Delete("recent")
  async clearRecent(@Req() req: IsmsRequest) {
    const result = await this.prisma.userDocumentActivity.deleteMany({
      where: { identity: req.identity.username },
    });
    await this.audit.record(
      req,
      "user-recent.clear",
      "user-document-activity",
      "success",
      { count: result.count },
    );
    return { deleted: result.count };
  }

  @Get("updates")
  async updates(@Req() req: IsmsRequest) {
    const preference = await this.prisma.userPreference.findUnique({
      where: { identity: req.identity.username },
      select: { lastSeenAt: true },
    });
    const readableSpaceIds = (
      await this.authorization.permittedSpaces(req.identity.groups, "read")
    ).map((space) => space.id);
    const since = preference?.lastSeenAt || new Date(0);
    const documents = await this.prisma.document.findMany({
      where: {
        deletedAt: null,
        status: "PUBLISHED",
        spaceId: { in: readableSpaceIds },
        updatedAt: { gt: since },
      },
      select: {
        id: true,
        updatedAt: true,
        translations: { select: { locale: true, title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return { since, count: documents.length, documents };
  }

  @Put("updates/seen")
  async markUpdatesSeen(@Req() req: IsmsRequest) {
    const lastSeenAt = new Date();
    await this.prisma.userPreference.upsert({
      where: { identity: req.identity.username },
      update: { lastSeenAt },
      create: { identity: req.identity.username, lastSeenAt },
    });
    return { lastSeenAt };
  }

  @Get("saved-searches")
  savedSearches(@Req() req: IsmsRequest) {
    return this.prisma.savedSearch.findMany({
      where: { identity: req.identity.username },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });
  }

  @Post("saved-searches")
  async saveSearch(@Req() req: IsmsRequest, @Body() body: SavedSearchDto) {
    const filters = Object.fromEntries(
      Object.entries(body.filters)
        .filter(
          ([key, value]) =>
            allowedFilterKeys.has(key) &&
            (typeof value === "string" || typeof value === "boolean"),
        )
        .map(([key, value]) => [key, String(value).slice(0, 200)]),
    ) as Prisma.InputJsonObject;
    return this.prisma.savedSearch.upsert({
      where: {
        identity_name: {
          identity: req.identity.username,
          name: body.name.trim(),
        },
      },
      update: { filters },
      create: {
        identity: req.identity.username,
        name: body.name.trim(),
        filters,
      },
    });
  }

  @Delete("saved-searches/:id")
  async deleteSearch(@Req() req: IsmsRequest, @Param("id") id: string) {
    await this.prisma.savedSearch.deleteMany({
      where: { id, identity: req.identity.username },
    });
    return { deleted: true };
  }

  @Post("access-requests")
  async requestAccess(@Req() req: IsmsRequest, @Body() body: AccessRequestDto) {
    const requestedUntil = body.requestedUntil
      ? new Date(body.requestedUntil)
      : new Date(Date.now() + 30 * 86400000);
    if (
      requestedUntil <= new Date() ||
      requestedUntil > new Date(Date.now() + 90 * 86400000)
    )
      throw new BadRequestException(
        "Requested access expiry must be within the next 90 days",
      );
    const [space, matchedGroup] = await Promise.all([
      this.prisma.documentSpace.findFirst({
        where: { id: body.spaceId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.directoryGroup.findFirst({
        where: {
          active: true,
          OR: req.identity.groups.map((name) => ({
            name: { equals: name, mode: "insensitive" as const },
          })),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
    const eligibleGroup =
      matchedGroup ||
      (req.identity.source === "local-admin"
        ? await this.prisma.directoryGroup.findFirst({
            where: { active: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : null);
    if (!eligibleGroup)
      throw new BadRequestException(
        "No application AD group is available for temporary access",
      );
    const document = body.documentId
      ? await this.prisma.document.findFirst({
          where: {
            id: body.documentId,
            spaceId: body.spaceId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : null;
    const visible = space
      ? await this.authorization.can(req.identity.groups, space.id, "showMenu")
      : false;
    if (!space || !visible || (body.documentId && !document))
      throw new NotFoundException();
    const pending = await this.prisma.accessRequest.findFirst({
      where: {
        identity: req.identity.username,
        spaceId: body.spaceId,
        documentId: body.documentId || null,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pending)
      throw new BadRequestException("An access request is already pending");
    const request = await this.prisma.accessRequest.create({
      data: {
        identity: req.identity.username,
        spaceId: body.spaceId,
        documentId: body.documentId,
        groupId: eligibleGroup.id,
        requestedUntil,
        justification: body.justification.trim(),
      },
    });
    await this.audit.record(
      req,
      "access-request.create",
      `access-request:${request.id}`,
      "success",
    );
    return request;
  }

  @Get("access-requests")
  requests(@Req() req: IsmsRequest) {
    return this.prisma.accessRequest.findMany({
      where: { identity: req.identity.username },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  @Post("document-reports")
  async report(@Req() req: IsmsRequest, @Body() body: DocumentReportDto) {
    const document = await this.prisma.document.findFirst({
      where: { id: body.documentId, deletedAt: null },
      select: { id: true, spaceId: true, status: true },
    });
    const allowed = document
      ? document.status === "PUBLISHED"
        ? await this.authorization.can(
            req.identity.groups,
            document.spaceId,
            "read",
          )
        : (
            await Promise.all(
              (["edit", "publish", "archive"] as const).map((permission) =>
                this.authorization.can(
                  req.identity.groups,
                  document.spaceId,
                  permission,
                ),
              ),
            )
          ).some(Boolean)
      : false;
    if (!document || !allowed) throw new NotFoundException();
    const report = await this.prisma.documentReport.create({
      data: {
        identity: req.identity.username,
        documentId: document.id,
        reason: body.reason,
        message: body.message?.trim() || null,
      },
    });
    await this.audit.record(
      req,
      "document-report.create",
      `document-report:${report.id}`,
      "success",
      { reason: body.reason },
    );
    return report;
  }

  @Get("document-reports")
  reports(@Req() req: IsmsRequest) {
    return this.prisma.documentReport.findMany({
      where: { identity: req.identity.username },
      include: {
        document: {
          select: { slug: true, translations: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  @Post("acknowledgements")
  async acknowledgeDocument(
    @Req() req: IsmsRequest,
    @Body() body: DocumentAcknowledgementDto,
  ) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { id: body.versionId, documentId: body.documentId },
      include: {
        document: { select: { spaceId: true, status: true, deletedAt: true } },
        storedFile: { select: { sha256: true } },
      },
    });
    if (
      !version ||
      version.document.deletedAt ||
      version.document.status !== "PUBLISHED" ||
      !(await this.authorization.can(
        req.identity.groups,
        version.document.spaceId,
        "read",
      ))
    )
      throw new NotFoundException();
    const acknowledgement = await this.prisma.documentAcknowledgement.upsert({
      where: {
        identity_versionId: {
          identity: req.identity.username,
          versionId: version.id,
        },
      },
      update: { acknowledgedAt: new Date(), sha256: version.storedFile.sha256 },
      create: {
        identity: req.identity.username,
        documentId: body.documentId,
        versionId: version.id,
        version: version.version,
        locale: version.locale,
        sha256: version.storedFile.sha256,
      },
    });
    await this.audit.record(
      req,
      "document.acknowledge",
      `document:${body.documentId}`,
      "success",
      {
        versionId: version.id,
        version: version.version,
        sha256: version.storedFile.sha256,
      },
    );
    return acknowledgement;
  }

  @Get("acknowledgements")
  acknowledgements(@Req() req: IsmsRequest) {
    return this.prisma.documentAcknowledgement.findMany({
      where: { identity: req.identity.username },
      orderBy: { acknowledgedAt: "desc" },
      take: 200,
    });
  }

  @Post("security-reports")
  @UseInterceptors(
    FileInterceptor("attachment", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  async securityReport(
    @Req() req: IsmsRequest,
    @Body() body: SecurityReportDto,
    @UploadedFile() attachment?: Express.Multer.File,
  ) {
    const reference = `SEC-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const reportId = randomUUID();
    let attachmentData = {};
    if (attachment) {
      const extension = extname(attachment.originalname).toLowerCase();
      if (
        !securityAttachmentTypes[extension]?.includes(attachment.mimetype) ||
        !validSecurityAttachmentMagic(attachment.buffer, extension)
      )
        throw new BadRequestException("Invalid security attachment");
      const scan = await this.antivirus.scan(attachment.buffer);
      if (scan.status !== "CLEAN")
        throw new BadRequestException(
          "Security attachment was rejected by antivirus",
        );
      const sha256 = createHash("sha256")
        .update(attachment.buffer)
        .digest("hex");
      const objectKey = `security-reports/${reportId}/${randomUUID()}${extension}`;
      await this.storage.putObject(objectKey, attachment.buffer, {
        "Content-Type": attachment.mimetype,
        "X-Isms-Sha256": sha256,
      });
      attachmentData = {
        attachmentObjectKey: objectKey,
        attachmentOriginalName: basename(attachment.originalname).replace(
          /[^a-zA-Z0-9._ -]/g,
          "_",
        ),
        attachmentMimeType: attachment.mimetype,
        attachmentSize: attachment.size,
        attachmentSha256: sha256,
      };
    }
    let report;
    try {
      report = await this.prisma.securityReport.create({
        data: {
          id: reportId,
          identity: req.identity.username,
          category: body.category,
          urgency: body.urgency,
          description: body.description.trim(),
          reference,
          ...attachmentData,
        },
      });
    } catch (error) {
      if (attachment && "attachmentObjectKey" in attachmentData)
        await this.storage
          .removeObject(String(attachmentData.attachmentObjectKey))
          .catch(() => undefined);
      throw error;
    }
    await this.audit.record(
      req,
      "security-report.create",
      `security-report:${report.id}`,
      "success",
      { reference, urgency: body.urgency, category: body.category },
    );
    return { reference: report.reference, status: report.status };
  }

  @Put("notifications/read-all")
  async readAllNotifications(@Req() req: IsmsRequest) {
    const updated = await this.prisma.userNotification.updateMany({
      where: {
        identity: req.identity.username,
        readAt: null,
        mandatory: false,
      },
      data: { readAt: new Date() },
    });
    return { read: updated.count };
  }

  @Get("notifications")
  notifications(@Req() req: IsmsRequest) {
    return this.prisma.userNotification.findMany({
      where: { identity: req.identity.username },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  @Put("notifications/:id/read")
  async readNotification(@Req() req: IsmsRequest, @Param("id") id: string) {
    const updated = await this.prisma.userNotification.updateMany({
      where: { id, identity: req.identity.username },
      data: { readAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException();
    return { read: true };
  }

  @Put("notifications/:id/acknowledge")
  async acknowledge(@Req() req: IsmsRequest, @Param("id") id: string) {
    const now = new Date();
    const updated = await this.prisma.userNotification.updateMany({
      where: { id, identity: req.identity.username, mandatory: true },
      data: { readAt: now, acknowledgedAt: now },
    });
    if (!updated.count) throw new NotFoundException();
    return { acknowledged: true };
  }

  @Put("preferences")
  preferences(@Req() req: IsmsRequest, @Body() body: UserPreferenceDto) {
    return this.prisma.userPreference.upsert({
      where: { identity: req.identity.username },
      update: body,
      create: { identity: req.identity.username, ...body },
    });
  }
}

const integrationArtifacts = {
  prometheus: {
    filename: "prometheus-isms.yml",
    content:
      'scrape_configs:\n  - job_name: isms-api\n    static_configs:\n      - targets: ["api:3001"]\n',
  },
  wazuh: {
    filename: "wazuh-isms-localfile.xml",
    content:
      "<localfile>\n  <log_format>json</log_format>\n  <location>/var/log/isms-portal/events.json</location>\n</localfile>\n",
  },
  zabbix: {
    filename: "zabbix-isms-macros.txt",
    content:
      "{$ISMS.URL}=http://reverse-proxy:8080\n{$ISMS.METRICS.URL}=http://api:3001/metrics\n",
  },
  syslog: {
    filename: "isms-syslog.env.example",
    content: "SYSLOG_ADDRESS=tcp+tls://syslog.example.invalid:6514\n",
  },
} as const;

@AdminOnly()
@Controller("admin/operations")
export class OperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Get("summary")
  async summary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failures, denied, accessRequests, reports, unreadNotifications] =
      await Promise.all([
        this.prisma.auditEvent.count({
          where: { occurredAt: { gte: since }, result: "failure" },
        }),
        this.prisma.auditEvent.count({
          where: { occurredAt: { gte: since }, result: "denied" },
        }),
        this.prisma.accessRequest.count({ where: { status: "PENDING" } }),
        this.prisma.documentReport.count({ where: { status: "OPEN" } }),
        this.prisma.userNotification.count({ where: { readAt: null } }),
      ]);
    return {
      periodHours: 24,
      failures,
      denied,
      accessRequests,
      reports,
      unreadNotifications,
    };
  }

  @Get("work-items")
  async workItems() {
    const [accessRequests, reports, securityReports] = await Promise.all([
      this.prisma.accessRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.documentReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { document: { select: { translations: true } } },
      }),
      this.prisma.securityReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return { accessRequests, reports, securityReports };
  }

  @Put("security-reports/:id")
  async resolveSecurityReport(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ReviewDto,
  ) {
    if (body.status !== "RESOLVED")
      throw new BadRequestException("Security report status must be RESOLVED");
    const report = await this.prisma.securityReport.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
    await this.audit.record(
      req,
      "security-report.resolve",
      `security-report:${id}`,
      "success",
      { reference: report.reference },
    );
    return report;
  }

  @Get("security-reports/:id/attachment")
  async securityReportAttachment(
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const report = await this.prisma.securityReport.findUnique({
      where: { id },
    });
    if (!report?.attachmentObjectKey) throw new NotFoundException();
    response.setHeader(
      "Content-Type",
      report.attachmentMimeType || "application/octet-stream",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${(report.attachmentOriginalName || "evidence").replace(/["\\]/g, "_")}"`,
    );
    (await this.storage.getObject(report.attachmentObjectKey)).pipe(response);
  }

  @Put("access-requests/:id")
  async reviewAccess(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ReviewDto,
  ) {
    if (body.status === "RESOLVED")
      throw new BadRequestException("Invalid access request status");
    const existing = await this.prisma.accessRequest.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status !== "PENDING")
      throw new BadRequestException("Access request is already decided");
    if (
      body.status === "APPROVED" &&
      (!existing.groupId || !existing.requestedUntil)
    )
      throw new BadRequestException(
        "Access request has no temporary grant target",
      );
    const request = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.accessRequest.update({
        where: { id },
        data: {
          status: body.status,
          decision: body.decision || null,
          reviewedBy: req.identity.username,
          reviewedAt: new Date(),
        },
      });
      if (body.status === "APPROVED")
        await tx.temporaryAccessGrant.create({
          data: {
            requestId: id,
            groupId: existing.groupId!,
            spaceId: existing.spaceId,
            validUntil: existing.requestedUntil!,
            createdBy: req.identity.username,
          },
        });
      return updated;
    });
    await this.prisma.userNotification.create({
      data: {
        identity: request.identity,
        title: "Demande d’accès traitée",
        message: body.decision || `Statut : ${body.status}`,
        resourceType: "access-request",
        resourceId: request.id,
      },
    });
    await this.audit.record(
      req,
      "access-request.review",
      `access-request:${id}`,
      "success",
      { status: body.status },
    );
    return request;
  }

  @Put("document-reports/:id")
  async resolveReport(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ReviewDto,
  ) {
    if (body.status !== "RESOLVED")
      throw new BadRequestException("Report status must be RESOLVED");
    const resolutionComment = body.decision?.trim();
    if (!resolutionComment)
      throw new BadRequestException("A resolution comment is required");
    const report = await this.prisma.documentReport.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolutionComment,
        resolvedBy: req.identity.username,
        resolvedAt: new Date(),
      },
    });
    await this.prisma.userNotification.create({
      data: {
        identity: report.identity,
        title: "Signalement traité",
        message: resolutionComment,
        resourceType: "document-report",
        resourceId: report.id,
      },
    });
    await this.audit.record(
      req,
      "document-report.resolve",
      `document-report:${id}`,
      "success",
      { resolutionComment },
    );
    return report;
  }

  @Delete("document-reports/:id")
  async deleteReport(@Req() req: IsmsRequest, @Param("id") id: string) {
    const report = await this.prisma.documentReport.findUnique({
      where: { id },
      select: { id: true, identity: true },
    });
    if (!report) throw new NotFoundException();
    await this.prisma.documentReport.delete({ where: { id } });
    await this.audit.record(
      req,
      "document-report.delete",
      `document-report:${id}`,
      "success",
      { reporter: report.identity },
    );
    return { deleted: true };
  }

  @Get("integrations")
  async integrations() {
    const settings = await this.prisma.applicationSetting.findMany({
      where: { key: { startsWith: "observability." } },
      orderBy: { key: "asc" },
    });
    return {
      network: "isms-portal_observability",
      metricsTarget: "api:3001/metrics",
      publicMetrics: false,
      optional: true,
      settings: settings.map(({ key, value, updatedAt }) => ({
        key,
        value,
        updatedAt,
      })),
    };
  }

  @Put("integrations/:tool")
  async configureIntegration(
    @Req() req: IsmsRequest,
    @Param("tool") tool: string,
    @Body() body: ObservabilityOptionsDto,
  ) {
    if (!(tool in integrationArtifacts)) throw new NotFoundException();
    const value = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    const setting = await this.prisma.applicationSetting.upsert({
      where: { key: `observability.${tool}` },
      update: { value },
      create: { key: `observability.${tool}`, value },
    });
    await this.audit.record(
      req,
      "observability.configure",
      `integration:${tool}`,
      "success",
      { enabled: body.enabled },
    );
    return setting;
  }

  @Get("integrations/:tool/download")
  downloadArtifact(
    @Param("tool") tool: string,
    @Query("portalUrl") portalUrl: string | undefined,
    @Res() response: Response,
  ) {
    const artifact =
      integrationArtifacts[tool as keyof typeof integrationArtifacts];
    if (!artifact) throw new NotFoundException();
    let publicUrl = "http://reverse-proxy:8080";
    if (portalUrl) {
      try {
        const parsed = new URL(portalUrl);
        if (["http:", "https:"].includes(parsed.protocol)) {
          publicUrl = parsed.origin;
        }
      } catch {
        // Keep the private Docker default for malformed URLs.
      }
    }
    response
      .type("text/plain")
      .attachment(artifact.filename)
      .send(artifact.content.replace("http://reverse-proxy:8080", publicUrl));
  }

  @Get("integrations/:tool/test")
  async testIntegration(@Param("tool") tool: string) {
    if (!(tool in integrationArtifacts)) throw new NotFoundException();
    const setting = await this.prisma.applicationSetting.findUnique({
      where: { key: `observability.${tool}` },
    });
    const value = setting?.value as { enabled?: boolean } | undefined;
    return {
      tool,
      applicationHealthy: true,
      metricsTarget: "api:3001/metrics",
      configured: Boolean(value?.enabled),
      lastConfigurationUpdate: setting?.updatedAt || null,
      note: "External connectivity is tested by the collector; the portal does not initiate outbound requests.",
    };
  }

  @Put("alert-policy")
  async alertPolicy(@Req() req: IsmsRequest, @Body() body: AlertPolicyDto) {
    const fiveXxPercent = Number(body.fiveXxPercent);
    const deniedPerMinute = Number(body.deniedPerMinute);
    if (
      !Number.isFinite(fiveXxPercent) ||
      fiveXxPercent < 0 ||
      fiveXxPercent > 100 ||
      !Number.isFinite(deniedPerMinute) ||
      deniedPerMinute < 0
    )
      throw new BadRequestException("Invalid alert threshold");
    const value = JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
    const setting = await this.prisma.applicationSetting.upsert({
      where: { key: "observability.alert-policy" },
      update: { value },
      create: { key: "observability.alert-policy", value },
    });
    await this.audit.record(
      req,
      "observability.alert-policy.update",
      "setting:observability.alert-policy",
      "success",
    );
    return setting;
  }
}
