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
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { AdminOnly } from "./security";
import { PrismaService } from "./prisma.service";
import { AuthorizationService } from "./authorization.service";
import { AuditService } from "./audit.service";
import type { IsmsRequest } from "./types";
import {
  AccessRequestDto,
  AlertPolicyDto,
  DocumentReportDto,
  ObservabilityOptionsDto,
  ReviewDto,
  SavedSearchDto,
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

@Controller("user-tools")
export class UserToolsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
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
    const space = await this.prisma.documentSpace.findFirst({
      where: { id: body.spaceId, deletedAt: null },
      select: { id: true },
    });
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
      where: { id: body.documentId, deletedAt: null, status: "PUBLISHED" },
      select: { id: true, spaceId: true },
    });
    if (
      !document ||
      !(await this.authorization.can(
        req.identity.groups,
        document.spaceId,
        "read",
      ))
    )
      throw new NotFoundException();
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
    const [accessRequests, reports] = await Promise.all([
      this.prisma.accessRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.documentReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { document: { select: { translations: true } } },
      }),
    ]);
    return { accessRequests, reports };
  }

  @Put("access-requests/:id")
  async reviewAccess(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ReviewDto,
  ) {
    if (body.status === "RESOLVED")
      throw new BadRequestException("Invalid access request status");
    const request = await this.prisma.accessRequest.update({
      where: { id },
      data: {
        status: body.status,
        decision: body.decision || null,
        reviewedBy: req.identity.username,
        reviewedAt: new Date(),
      },
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
    const report = await this.prisma.documentReport.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedBy: req.identity.username,
        resolvedAt: new Date(),
      },
    });
    await this.prisma.userNotification.create({
      data: {
        identity: report.identity,
        title: "Signalement traité",
        message: body.decision || "Votre signalement a été traité.",
        resourceType: "document-report",
        resourceId: report.id,
      },
    });
    await this.audit.record(
      req,
      "document-report.resolve",
      `document-report:${id}`,
      "success",
    );
    return report;
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
