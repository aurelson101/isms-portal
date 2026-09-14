import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  ForbiddenException,
  NotFoundException,
  Param,
  Put,
  Req,
} from "@nestjs/common";
import { AuditService } from "./audit.service";
import { PrismaService } from "./prisma.service";
import { ApproverOnly } from "./security";
import { isAdminIdentity } from "./security";
import { ReviewDecisionDto } from "./governance.dto";
import type { IsmsRequest } from "./types";

@Controller("approvals")
@ApproverOnly()
export class ApprovalsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@Req() req: IsmsRequest) {
    if (!isAdminIdentity(req.identity.groups)) return [];
    const approvals = await this.prisma.sensitiveOperationApproval.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return approvals.map((item) => ({ ...item, canDecide: item.requestedBy.toLowerCase() !== req.identity.username.toLowerCase() }));
  }

  @Put(":id/decision")
  async decide(
    @Req() req: IsmsRequest,
    @Param("id") id: string,
    @Body() body: { status?: string },
  ) {
    if (!isAdminIdentity(req.identity.groups)) throw new ForbiddenException("An administrator must decide privileged operations");
    if (!body.status || !["APPROVED", "REJECTED"].includes(body.status))
      throw new BadRequestException("Approval status must be APPROVED or REJECTED");
    const existing = await this.prisma.sensitiveOperationApproval.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status !== "PENDING")
      throw new ConflictException("Approval already decided");
    if (existing.requestedBy.toLowerCase() === req.identity.username.toLowerCase())
      throw new ConflictException("A requester cannot approve their own request");
    const changed = await this.prisma.sensitiveOperationApproval.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: body.status,
        approvedBy: req.identity.username,
        approvedAt: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException("Approval already decided");
    const item = await this.prisma.sensitiveOperationApproval.findUniqueOrThrow({ where: { id } });
    await this.prisma.userNotification.create({
      data: {
        identity: item.requestedBy,
        title: "Demande d’approbation traitée",
        message: `${item.operation} : ${body.status} par ${req.identity.username}`,
        mandatory: true,
        resourceType: "sensitive-approval",
        resourceId: item.id,
      },
    });
    await this.audit.record(
      req,
      "sensitive-approval.decision",
      `sensitive-approval:${id}`,
      "success",
      { status: body.status, requestedBy: item.requestedBy },
    );
    return item;
  }
}

@Controller("reviews")
export class ReviewInboxController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list(@Req() req: IsmsRequest) {
    const identity = { equals: req.identity.username, mode: "insensitive" as const };
    const reviews = await this.prisma.documentReview.findMany({
      where: isAdminIdentity(req.identity.groups) ? {} : { OR: [{ owner: identity }, { reviewer: identity }, { approver: identity }] },
      include: { document: { select: { slug: true, translations: true } } }, orderBy: { createdAt: "desc" }, take: 200,
    });
    return reviews.map((review) => ({ ...review, canDecide: review.owner.toLowerCase() !== req.identity.username.toLowerCase() && (isAdminIdentity(req.identity.groups) || review.approver.toLowerCase() === req.identity.username.toLowerCase()) }));
  }

  @Put(":id/decision")
  async decide(@Req() req: IsmsRequest, @Param("id") id: string, @Body() body: ReviewDecisionDto) {
    const item = await this.prisma.documentReview.findUnique({ where: { id } });
    if (!item) throw new NotFoundException();
    const actor = req.identity.username.toLowerCase();
    const allowed = isAdminIdentity(req.identity.groups) || item.approver.toLowerCase() === actor || (body.status === "IN_REVIEW" && item.reviewer.toLowerCase() === actor);
    if (!allowed) throw new ForbiddenException();
    if (actor === item.owner.toLowerCase()) throw new ForbiddenException("The owner cannot approve their own review");
    const closed = body.status !== "IN_REVIEW";
    const changed = await this.prisma.documentReview.updateMany({ where: { id, status: { in: ["PENDING", "IN_REVIEW"] } }, data: { status: body.status, decisionComment: body.comment.trim(), decidedBy: closed ? req.identity.username : null, decidedAt: closed ? new Date() : null } });
    if (!changed.count) throw new ConflictException("Review already closed");
    if (closed) await this.prisma.userNotification.createMany({ data: [...new Set([item.owner, item.reviewer, item.approver])].map((identity) => ({ identity, title: "Document review decision", message: `${body.status}: ${body.comment.trim()}`, resourceType: "document-review", resourceId: id, mandatory: body.status === "REJECTED" })) });
    await this.audit.record(req, "document-review.decision", `document-review:${id}`, "success", { before: item.status, after: body.status });
    return this.prisma.documentReview.findUnique({ where: { id } });
  }
}
