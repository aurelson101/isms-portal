import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "./audit.service";
import { SensitiveApprovalService } from "./sensitive-approval.service";
import {
  AccessCertificationDto,
  ComplianceControlDto,
  CorrectiveActionDto,
  DocumentReviewDto,
  GovernanceBulkDto,
  IncidentCaseDto,
  RetentionDecisionDto,
  RetentionPolicyDto,
  RiskExceptionDecisionDto,
  RiskExceptionDto,
  ReviewDecisionDto,
  SavedViewDto,
  SensitiveApprovalDecisionDto,
  SensitiveApprovalDto,
} from "./governance.dto";
import { PrismaService } from "./prisma.service";
import { AdminOnly } from "./security";
import type { IsmsRequest } from "./types";

const clean = (value?: string) => value?.trim() || null;

@Controller("admin/governance")
@AdminOnly()
export class GovernanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sensitiveApprovalGate: SensitiveApprovalService,
  ) {}

  private async refreshRiskExceptions() {
    const reviewAt = new Date(Date.now() + 30 * 86400000);
    const due = await this.prisma.riskException.findMany({
      where: {
        status: "APPROVED",
        reviewNotifiedAt: null,
        expiresAt: { lte: reviewAt },
      },
      take: 100,
    });
    for (const item of due) {
      const identities = [...new Set([item.owner, item.approver])];
      await this.prisma.$transaction([
        this.prisma.riskException.update({
          where: { id: item.id },
          data: { status: "REVIEW_DUE", reviewNotifiedAt: new Date() },
        }),
        ...identities.map((identity) =>
          this.prisma.userNotification.create({
            data: {
              identity,
              title: "Dérogation à renouveler",
              message: `${item.title} expire le ${item.expiresAt.toISOString()}`,
              mandatory: true,
              resourceType: "risk-exception",
              resourceId: item.id,
            },
          }),
        ),
      ]);
    }
  }

  @Get("summary")
  async summary() {
    const now = new Date();
    const [
      reviews,
      controls,
      holds,
      incidents,
      overdueActions,
      certifications,
    ] = await Promise.all([
      this.prisma.documentReview.count({
        where: { status: { in: ["PENDING", "IN_REVIEW"] } },
      }),
      this.prisma.complianceControl.count(),
      this.prisma.retentionPolicy.count({ where: { legalHold: true } }),
      this.prisma.incidentCase.count({
        where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      }),
      this.prisma.correctiveAction.count({
        where: { status: { not: "DONE" }, dueAt: { lt: now } },
      }),
      this.prisma.accessRule.count({
        where: {
          lifetime: false,
          certificationDueAt: { lt: now },
        },
      }),
    ]);
    return {
      reviews,
      controls,
      holds,
      incidents,
      overdueActions,
      certifications,
    };
  }

  @Get("kpi")
  async kpi() {
    await this.refreshRiskExceptions();
    const now = new Date();
    const since = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const [
      documents,
      published,
      overdueReviews,
      controls,
      implementedControls,
      incidents,
      resolvedIncidents,
      openRisks,
      expiringExceptions,
      pendingApprovals,
      acknowledgements,
    ] = await Promise.all([
      this.prisma.document.count({ where: { deletedAt: null } }),
      this.prisma.document.count({
        where: { deletedAt: null, status: "PUBLISHED" },
      }),
      this.prisma.documentReview.count({
        where: { dueAt: { lt: now }, status: { in: ["PENDING", "IN_REVIEW"] } },
      }),
      this.prisma.complianceControl.count(),
      this.prisma.complianceControl.count({
        where: { implementationStatus: "IMPLEMENTED" },
      }),
      this.prisma.incidentCase.count({ where: { occurredAt: { gte: since } } }),
      this.prisma.incidentCase.count({
        where: {
          occurredAt: { gte: since },
          status: { in: ["RESOLVED", "CLOSED"] },
        },
      }),
      this.prisma.riskException.count({ where: { status: "PENDING" } }),
      this.prisma.riskException.count({
        where: {
          status: "APPROVED",
          expiresAt: { lte: new Date(now.getTime() + 30 * 86400000) },
        },
      }),
      this.prisma.sensitiveOperationApproval.count({
        where: { status: "PENDING" },
      }),
      this.prisma.documentAcknowledgement.count({
        where: { acknowledgedAt: { gte: since } },
      }),
    ]);
    return {
      generatedAt: now,
      documents: {
        total: documents,
        published,
        publicationRate: documents
          ? Math.round((published / documents) * 100)
          : 0,
      },
      controls: {
        total: controls,
        implemented: implementedControls,
        implementationRate: controls
          ? Math.round((implementedControls / controls) * 100)
          : 0,
      },
      reviews: { overdue: overdueReviews },
      incidents: {
        annual: incidents,
        resolved: resolvedIncidents,
        resolutionRate: incidents
          ? Math.round((resolvedIncidents / incidents) * 100)
          : 0,
      },
      risks: { openExceptions: openRisks, expiringExceptions },
      approvals: { pending: pendingApprovals },
      acknowledgements: { annual: acknowledgements },
    };
  }

  @Get("risk-exceptions")
  async riskExceptions() {
    await this.refreshRiskExceptions();
    return this.prisma.riskException.findMany({
      orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
      take: 300,
    });
  }

  @Post("risk-exceptions")
  async createRiskException(
    @Req() req: IsmsRequest,
    @Body() body: RiskExceptionDto,
  ) {
    if (body.owner.trim().toLowerCase() === body.approver.trim().toLowerCase())
      throw new BadRequestException("Owner and approver must be distinct");
    if (new Date(body.expiresAt) <= new Date())
      throw new BadRequestException("Expiry must be in the future");
    const item = await this.prisma.riskException.create({
      data: {
        ...body,
        title: body.title.trim(),
        owner: body.owner.trim(),
        approver: body.approver.trim(),
        justification: body.justification.trim(),
        compensatingControl: body.compensatingControl.trim(),
        expiresAt: new Date(body.expiresAt),
      },
    });
    await this.audit.record(
      req,
      "risk-exception.create",
      `risk-exception:${item.id}`,
      "success",
      { expiresAt: item.expiresAt },
    );
    return item;
  }

  @Put("risk-exceptions/:id/decision")
  async decideRiskException(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: RiskExceptionDecisionDto,
  ) {
    const existing = await this.prisma.riskException.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (!["PENDING", "REVIEW_DUE"].includes(existing.status))
      throw new ConflictException("Exception already decided");
    if (existing.approver.toLowerCase() !== req.identity.username.toLowerCase())
      throw new ConflictException("Only the designated approver can decide");
    const expiresAt = body.expiresAt
      ? new Date(body.expiresAt)
      : existing.expiresAt;
    if (
      body.status === "APPROVED" &&
      existing.status === "REVIEW_DUE" &&
      expiresAt <= new Date(Date.now() + 30 * 86400000)
    )
      throw new BadRequestException(
        "Renewal expiry must be more than 30 days away",
      );
    const item = await this.prisma.riskException.update({
      where: { id },
      data: {
        status: body.status,
        approvedBy: req.identity.username,
        approvedAt: new Date(),
        expiresAt,
        reviewNotifiedAt: null,
      },
    });
    await this.audit.record(
      req,
      "risk-exception.decision",
      `risk-exception:${id}`,
      "success",
      { status: body.status },
    );
    return item;
  }

  @Get("sensitive-approvals")
  sensitiveApprovals() {
    return this.prisma.sensitiveOperationApproval.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
    });
  }

  @Post("sensitive-approvals")
  async requestSensitiveApproval(
    @Req() req: IsmsRequest,
    @Body() body: SensitiveApprovalDto,
  ) {
    const pending = await this.prisma.sensitiveOperationApproval.findFirst({
      where: {
        operation: body.operation,
        targetType: body.targetType,
        targetId: body.targetId,
        status: "PENDING",
      },
    });
    if (pending) throw new ConflictException("Approval already pending");
    const item = await this.prisma.sensitiveOperationApproval.create({
      data: {
        ...body,
        requestedBy: req.identity.username,
        reason: body.reason.trim(),
      },
    });
    await this.audit.record(
      req,
      "sensitive-approval.request",
      `sensitive-approval:${item.id}`,
      "success",
      {
        operation: item.operation,
        targetType: item.targetType,
        targetId: item.targetId,
      },
    );
    return item;
  }

  @Put("sensitive-approvals/:id/decision")
  async decideSensitiveApproval(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: SensitiveApprovalDecisionDto,
  ) {
    const existing = await this.prisma.sensitiveOperationApproval.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status !== "PENDING")
      throw new ConflictException("Approval already decided");
    if (
      existing.requestedBy.toLowerCase() === req.identity.username.toLowerCase()
    )
      throw new ConflictException("A second administrator is required");
    const item = await this.prisma.sensitiveOperationApproval.update({
      where: { id },
      data: {
        status: body.status,
        approvedBy: req.identity.username,
        approvedAt: new Date(),
      },
    });
    await this.audit.record(
      req,
      "sensitive-approval.decision",
      `sensitive-approval:${id}`,
      "success",
      { status: body.status },
    );
    return item;
  }

  @Get("reviews")
  reviews() {
    return this.prisma.documentReview.findMany({
      include: {
        document: { include: { translations: true, space: true } },
        version: { select: { id: true, locale: true, version: true } },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  @Post("reviews")
  async createReview(@Req() req: IsmsRequest, @Body() body: DocumentReviewDto) {
    const participants = [body.owner, body.reviewer, body.approver].map(
      (value) => value.trim().toLowerCase(),
    );
    if (new Set(participants).size !== 3)
      throw new BadRequestException(
        "Owner, reviewer and approver must be distinct",
      );
    if (new Date(body.dueAt) <= new Date())
      throw new BadRequestException("Review due date must be in the future");
    const document = await this.prisma.document.findFirst({
      where: { id: body.documentId, deletedAt: null },
      select: {
        id: true,
        versions: {
          select: { id: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
    });
    if (!document) throw new NotFoundException("Document not found");
    const versionId = body.versionId || document.versions?.[0]?.id || null;
    if (body.versionId) {
      const version = await this.prisma.documentVersion.findFirst({
        where: { id: body.versionId, documentId: body.documentId },
        select: { id: true },
      });
      if (!version)
        throw new BadRequestException("Version does not belong to document");
    }
    const review = await this.prisma.documentReview.create({
      data: {
        documentId: body.documentId,
        versionId,
        owner: body.owner.trim(),
        reviewer: body.reviewer.trim(),
        approver: body.approver.trim(),
        dueAt: new Date(body.dueAt),
      },
    });
    await this.prisma.userNotification.createMany({
      data: [...new Set([review.owner, review.reviewer, review.approver])].map(
        (identity) => ({
          identity,
          title: "Revue documentaire assignée",
          message: `Une revue documentaire vous a été assignée avec une échéance au ${review.dueAt.toISOString()}.`,
          resourceType: "document-review",
          resourceId: review.id,
          mandatory: true,
        }),
      ),
    });
    await this.audit.record(
      req,
      "document-review.create",
      `document-review:${review.id}`,
      "success",
      {
        documentId: review.documentId,
        versionId: review.versionId,
        dueAt: review.dueAt,
      },
    );
    return review;
  }

  @Put("reviews/:id/decision")
  async decideReview(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ReviewDecisionDto,
  ) {
    const existing = await this.prisma.documentReview.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (["APPROVED", "REJECTED", "CANCELLED"].includes(existing.status))
      throw new ConflictException("Review is already closed");
    const closed = body.status !== "IN_REVIEW";
    const review = await this.prisma.documentReview.update({
      where: { id },
      data: {
        status: body.status,
        decisionComment: body.comment.trim(),
        decidedBy: closed ? req.identity.username : null,
        decidedAt: closed ? new Date() : null,
      },
    });
    if (closed)
      await this.prisma.userNotification.createMany({
        data: [
          ...new Set([existing.owner, existing.reviewer, existing.approver]),
        ].map((identity) => ({
          identity,
          title:
            review.status === "APPROVED"
              ? "Revue documentaire approuvée"
              : "Revue documentaire refusée",
          message: review.decisionComment || "Décision enregistrée",
          resourceType: "document-review",
          resourceId: review.id,
          mandatory: review.status === "REJECTED",
        })),
      });
    await this.audit.record(
      req,
      "document-review.decision",
      `document-review:${id}`,
      "success",
      {
        before: existing.status,
        after: review.status,
      },
    );
    return review;
  }

  @Get("access-certifications")
  accessCertifications() {
    return this.prisma.accessRule.findMany({
      include: { group: true, space: true },
      orderBy: [{ lifetime: "desc" }, { certificationDueAt: "asc" }],
      take: 300,
    });
  }

  @Put("access-certifications/:id")
  async certifyAccess(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: AccessCertificationDto,
  ) {
    const existing = await this.prisma.accessRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (!body.lifetime && (!body.certificationDueAt || !body.validUntil))
      throw new BadRequestException(
        "Expiring access requires an expiry and certification due date",
      );
    const dueAt = body.lifetime ? null : new Date(body.certificationDueAt!);
    const validUntil = body.lifetime ? null : new Date(body.validUntil!);
    if (dueAt && dueAt <= new Date())
      throw new BadRequestException(
        "Certification due date must be in the future",
      );
    if (validUntil && validUntil <= new Date())
      throw new BadRequestException("Access expiry date must be in the future");
    const rule = await this.prisma.accessRule.update({
      where: { id },
      data: {
        lifetime: body.lifetime,
        validUntil,
        lastCertifiedAt: new Date(),
        lastCertifiedBy: req.identity.username,
        certificationDueAt: dueAt,
        justification: body.justification.trim(),
      },
      include: { group: true, space: true },
    });
    await this.audit.record(
      req,
      "access-rule.certify",
      `access-rule:${id}`,
      "success",
      {
        lifetime: rule.lifetime,
        certificationDueAt: rule.certificationDueAt,
      },
    );
    return rule;
  }

  @Get("controls")
  controls() {
    return this.prisma.complianceControl.findMany({
      include: { evidenceDocument: { include: { translations: true } } },
      orderBy: [{ framework: "asc" }, { reference: "asc" }],
      take: 500,
    });
  }

  @Post("controls")
  async createControl(
    @Req() req: IsmsRequest,
    @Body() body: ComplianceControlDto,
  ) {
    if (body.applicability === "NOT_APPLICABLE" && !clean(body.justification))
      throw new BadRequestException(
        "Non-applicability requires a justification",
      );
    if (body.evidenceDocumentId)
      await this.requireDocument(body.evidenceDocumentId);
    try {
      const control = await this.prisma.complianceControl.create({
        data: {
          ...body,
          framework: body.framework.trim(),
          reference: body.reference.trim(),
          title: body.title.trim(),
          owner: body.owner.trim(),
          justification: clean(body.justification),
          evidenceDocumentId: body.evidenceDocumentId || null,
        },
      });
      await this.audit.record(
        req,
        "compliance-control.create",
        `compliance-control:${control.id}`,
        "success",
        {
          framework: control.framework,
          reference: control.reference,
        },
      );
      return control;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException(
          "Control reference already exists in framework",
        );
      throw error;
    }
  }

  @Put("controls/:id")
  async updateControl(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: ComplianceControlDto,
  ) {
    const existing = await this.prisma.complianceControl.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (body.applicability === "NOT_APPLICABLE" && !clean(body.justification))
      throw new BadRequestException(
        "Non-applicability requires a justification",
      );
    if (body.evidenceDocumentId)
      await this.requireDocument(body.evidenceDocumentId);
    const control = await this.prisma.complianceControl.update({
      where: { id },
      data: {
        ...body,
        framework: body.framework.trim(),
        reference: body.reference.trim(),
        title: body.title.trim(),
        owner: body.owner.trim(),
        justification: clean(body.justification),
        evidenceDocumentId: body.evidenceDocumentId || null,
      },
    });
    await this.audit.record(
      req,
      "compliance-control.update",
      `compliance-control:${id}`,
      "success",
      {
        before: {
          applicability: existing.applicability,
          status: existing.implementationStatus,
        },
        after: {
          applicability: control.applicability,
          status: control.implementationStatus,
        },
      },
    );
    return control;
  }

  @Get("retention")
  retention() {
    return this.prisma.retentionPolicy.findMany({
      include: { document: { include: { translations: true, space: true } } },
      orderBy: [{ legalHold: "desc" }, { retentionUntil: "asc" }],
      take: 300,
    });
  }

  @Put("retention")
  async saveRetention(
    @Req() req: IsmsRequest,
    @Body() body: RetentionPolicyDto,
  ) {
    await this.requireDocument(body.documentId);
    const retentionUntil = body.retentionUntil
      ? new Date(body.retentionUntil)
      : null;
    if (!body.legalHold && !retentionUntil)
      throw new BadRequestException(
        "Retention requires a date or a legal hold",
      );
    const existingPolicy = await this.prisma.retentionPolicy.findUnique({
      where: { documentId: body.documentId },
      select: { id: true },
    });
    const approvalId = existingPolicy
      ? await this.sensitiveApprovalGate.require(
          req,
          "RETENTION_CHANGE",
          "DOCUMENT",
          body.documentId,
          body.reason.trim(),
        )
      : "";
    const policy = await this.prisma.retentionPolicy.upsert({
      where: { documentId: body.documentId },
      create: {
        documentId: body.documentId,
        retentionUntil,
        legalHold: body.legalHold,
        reason: body.reason.trim(),
      },
      update: {
        retentionUntil,
        legalHold: body.legalHold,
        reason: body.reason.trim(),
        ...(body.legalHold
          ? {
              destructionStatus: "NONE",
              requestedBy: null,
              requestedAt: null,
              approvedBy: null,
              approvedAt: null,
            }
          : {}),
      },
      include: { document: { include: { translations: true } } },
    });
    await this.audit.record(
      req,
      "retention-policy.save",
      `retention-policy:${policy.id}`,
      "success",
      {
        documentId: policy.documentId,
        legalHold: policy.legalHold,
        retentionUntil: policy.retentionUntil,
      },
    );
    await this.sensitiveApprovalGate.execute(approvalId);
    return policy;
  }

  @Put("retention/:id/destruction")
  async retentionDecision(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: RetentionDecisionDto,
  ) {
    const policy = await this.prisma.retentionPolicy.findUnique({
      where: { id },
    });
    if (!policy) throw new NotFoundException();
    if (policy.legalHold)
      throw new ConflictException(
        "Legal hold blocks every destruction request",
      );
    if (body.action === "REQUEST") {
      if (policy.retentionUntil && policy.retentionUntil > new Date())
        throw new ConflictException("Retention period has not ended");
      const updated = await this.prisma.retentionPolicy.update({
        where: { id },
        data: {
          destructionStatus: "REQUESTED",
          requestedBy: req.identity.username,
          requestedAt: new Date(),
          reason: body.reason.trim(),
          approvedBy: null,
          approvedAt: null,
        },
      });
      await this.audit.record(
        req,
        "retention-destruction.request",
        `retention-policy:${id}`,
        "success",
      );
      return updated;
    }
    if (policy.destructionStatus !== "REQUESTED")
      throw new ConflictException("No destruction request is pending");
    if (
      body.action === "APPROVE" &&
      policy.requestedBy === req.identity.username
    )
      throw new ConflictException(
        "A second administrator must approve destruction",
      );
    const updated = await this.prisma.retentionPolicy.update({
      where: { id },
      data:
        body.action === "APPROVE"
          ? {
              destructionStatus: "APPROVED",
              approvedBy: req.identity.username,
              approvedAt: new Date(),
            }
          : {
              destructionStatus: "REJECTED",
              approvedBy: req.identity.username,
              approvedAt: new Date(),
            },
    });
    await this.audit.record(
      req,
      `retention-destruction.${body.action.toLowerCase()}`,
      `retention-policy:${id}`,
      "success",
      {
        requester: policy.requestedBy,
      },
    );
    return updated;
  }

  @Get("identity-health")
  async identityHealth(@Query("dormantDays") dormantDaysValue = "90") {
    const dormantDays = Math.min(
      730,
      Math.max(30, Number(dormantDaysValue) || 90),
    );
    const threshold = new Date(Date.now() - dormantDays * 86400000);
    const [connections, certificates, dormantAccounts, staleGroups, sessions] =
      await Promise.all([
        this.prisma.directoryConnection.findMany({
          select: {
            id: true,
            name: true,
            protocol: true,
            enabled: true,
            lastTestStatus: true,
            lastTestAt: true,
            syncJobs: {
              select: { status: true, startedAt: true, finishedAt: true },
              orderBy: { startedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
        }),
        this.prisma.trustedCaCertificate.findMany({
          select: { id: true, name: true, validFrom: true, validTo: true },
          orderBy: { validTo: "asc" },
        }),
        this.prisma.adminAccount.findMany({
          where: {
            active: true,
            primary: false,
            OR: [
              { lastAuthorizedAt: null },
              { lastAuthorizedAt: { lt: threshold } },
            ],
          },
          select: {
            id: true,
            username: true,
            source: true,
            lastAuthorizedAt: true,
          },
          orderBy: { username: "asc" },
        }),
        this.prisma.directoryGroup.findMany({
          where: {
            active: true,
            OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: threshold } }],
          },
          select: { id: true, name: true, lastSyncedAt: true },
          orderBy: { name: "asc" },
        }),
        this.prisma.adminSession.count({
          where: { expiresAt: { gt: new Date() } },
        }),
      ]);
    return {
      dormantDays,
      threshold,
      connections,
      certificates,
      dormantAccounts,
      staleGroups,
      activeSessions: sessions,
    };
  }

  @Get("incidents")
  incidents() {
    return this.prisma.incidentCase.findMany({
      include: { correctiveActions: { orderBy: { dueAt: "asc" } } },
      orderBy: [{ occurredAt: "desc" }, { reference: "asc" }],
      take: 300,
    });
  }

  @Post("incidents")
  async createIncident(@Req() req: IsmsRequest, @Body() body: IncidentCaseDto) {
    try {
      const incident = await this.prisma.incidentCase.create({
        data: {
          ...body,
          reference: body.reference.trim().toUpperCase(),
          title: body.title.trim(),
          owner: body.owner.trim(),
          occurredAt: new Date(body.occurredAt),
          rootCause: clean(body.rootCause),
          lessonsLearned: clean(body.lessonsLearned),
        },
      });
      await this.audit.record(
        req,
        "incident-case.create",
        `incident-case:${incident.id}`,
        "success",
        {
          reference: incident.reference,
          severity: incident.severity,
        },
      );
      return incident;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Incident reference already exists");
      throw error;
    }
  }

  @Put("incidents/:id")
  async updateIncident(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: IncidentCaseDto,
  ) {
    const existing = await this.prisma.incidentCase.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (["RESOLVED", "CLOSED"].includes(body.status) && !clean(body.rootCause))
      throw new BadRequestException("Resolved incidents require a root cause");
    const incident = await this.prisma.incidentCase.update({
      where: { id },
      data: {
        ...body,
        reference: body.reference.trim().toUpperCase(),
        title: body.title.trim(),
        owner: body.owner.trim(),
        occurredAt: new Date(body.occurredAt),
        rootCause: clean(body.rootCause),
        lessonsLearned: clean(body.lessonsLearned),
      },
    });
    await this.audit.record(
      req,
      "incident-case.update",
      `incident-case:${id}`,
      "success",
      {
        before: existing.status,
        after: incident.status,
      },
    );
    return incident;
  }

  @Post("incidents/:id/actions")
  async createCorrectiveAction(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: CorrectiveActionDto,
  ) {
    const incident = await this.prisma.incidentCase.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!incident) throw new NotFoundException();
    const action = await this.prisma.correctiveAction.create({
      data: {
        incidentId: id,
        description: body.description.trim(),
        owner: body.owner.trim(),
        dueAt: new Date(body.dueAt),
        status: body.status,
        completedAt: body.status === "DONE" ? new Date() : null,
      },
    });
    await this.audit.record(
      req,
      "corrective-action.create",
      `corrective-action:${action.id}`,
      "success",
      {
        incidentId: id,
        dueAt: action.dueAt,
      },
    );
    return action;
  }

  @Get("saved-views")
  savedViews(@Req() req: IsmsRequest, @Query("section") section?: string) {
    return this.prisma.adminSavedView.findMany({
      where: {
        identity: req.identity.username,
        ...(section ? { section: section.slice(0, 80) } : {}),
      },
      orderBy: [{ section: "asc" }, { name: "asc" }],
      take: 100,
    });
  }

  @Post("saved-views")
  async saveView(@Req() req: IsmsRequest, @Body() body: SavedViewDto) {
    const serialized = JSON.stringify(body.config);
    if (
      serialized.length > 10000 ||
      /"(?:__proto__|prototype|constructor)"\s*:/.test(serialized)
    )
      throw new BadRequestException("Saved view configuration is invalid");
    const view = await this.prisma.adminSavedView.upsert({
      where: {
        identity_section_name: {
          identity: req.identity.username,
          section: body.section.trim(),
          name: body.name.trim(),
        },
      },
      create: {
        identity: req.identity.username,
        section: body.section.trim(),
        name: body.name.trim(),
        config: body.config as Prisma.InputJsonValue,
      },
      update: { config: body.config as Prisma.InputJsonValue },
    });
    await this.audit.record(
      req,
      "admin-view.save",
      `admin-view:${view.id}`,
      "success",
      {
        section: view.section,
      },
    );
    return view;
  }

  @Delete("saved-views/:id")
  async deleteView(@Req() req: IsmsRequest, @Param("id") id: string) {
    const result = await this.prisma.adminSavedView.deleteMany({
      where: { id, identity: req.identity.username },
    });
    if (!result.count) throw new NotFoundException();
    await this.audit.record(
      req,
      "admin-view.delete",
      `admin-view:${id}`,
      "success",
    );
    return { deleted: true };
  }

  @Post("bulk/preview")
  bulkPreview(@Body() body: GovernanceBulkDto) {
    return this.previewBulk(body);
  }

  @Post("bulk/apply")
  async bulkApply(@Req() req: IsmsRequest, @Body() body: GovernanceBulkDto) {
    if (!body.confirmed)
      throw new BadRequestException("Bulk operation requires confirmation");
    const preview = await this.previewBulk(body);
    if (body.kind === "INCIDENT_STATUS") {
      await this.prisma.incidentCase.updateMany({
        where: { id: { in: body.ids } },
        data: { status: body.value },
      });
    } else {
      await this.prisma.documentReview.updateMany({
        where: { id: { in: body.ids } },
        data: {
          status: body.value,
          decidedBy: req.identity.username,
          decidedAt: new Date(),
        },
      });
    }
    await this.audit.record(req, "governance.bulk", body.kind, "success", {
      count: preview.count,
      value: body.value,
    });
    return { ...preview, applied: true };
  }

  private async previewBulk(body: GovernanceBulkDto) {
    const ids = [...new Set(body.ids)];
    if (!ids.length) throw new BadRequestException("Select at least one item");
    if (body.kind === "INCIDENT_STATUS") {
      if (
        !["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"].includes(
          body.value,
        )
      )
        throw new BadRequestException("Invalid incident status");
      const targets = await this.prisma.incidentCase.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          rootCause: true,
        },
      });
      if (targets.length !== ids.length)
        throw new NotFoundException("One or more incidents do not exist");
      if (
        ["RESOLVED", "CLOSED"].includes(body.value) &&
        targets.some((target) => !clean(target.rootCause || undefined))
      )
        throw new BadRequestException(
          "Every resolved incident requires a root cause",
        );
      return {
        kind: body.kind,
        value: body.value,
        count: targets.length,
        targets,
      };
    }
    if (
      !["IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"].includes(body.value)
    )
      throw new BadRequestException("Invalid review status");
    const targets = await this.prisma.documentReview.findMany({
      where: { id: { in: ids }, status: { in: ["PENDING", "IN_REVIEW"] } },
      select: { id: true, owner: true, status: true, documentId: true },
    });
    if (targets.length !== ids.length)
      throw new ConflictException("Only open reviews can be changed in bulk");
    return {
      kind: body.kind,
      value: body.value,
      count: targets.length,
      targets,
    };
  }

  private async requireDocument(id: string) {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new NotFoundException("Document not found");
  }
}
