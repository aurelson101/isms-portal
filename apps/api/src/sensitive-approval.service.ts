import { ConflictException, Injectable } from "@nestjs/common";
import { NotificationService } from "./notification.service";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";

@Injectable()
export class SensitiveApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  private async notifyApprovers(approval: { id: string; requestedBy: string; createdAt: Date }) {
    const now = new Date();
    const accounts = await this.prisma.adminAccount.findMany({ where: { active: true, role: "ADMIN", AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }] }, select: { username: true } });
    const identities = [...new Set(accounts.map((item) => item.username))].filter((identity) => identity.toLowerCase() !== approval.requestedBy.toLowerCase());
    if (identities.length) await this.prisma.userNotification.createMany({ data: identities.map((identity) => ({ identity, title: "Approval required", message: `${approval.requestedBy} requested approval.`, mandatory: true, resourceType: "sensitive-approval", resourceId: approval.id })) });
    try {
      await this.notifications.enqueue({ action: "sensitive-approval.request", resource: "sensitive-approval:" + approval.id, actor: approval.requestedBy, at: approval.createdAt.toISOString() }, "approval-" + approval.id);
    } catch {
      process.stderr.write(JSON.stringify({ level: "error", event: "notification.enqueue.failed", resource: "sensitive-approval:" + approval.id }) + "\n");
    }
  }

  async require(
    req: IsmsRequest,
    operation: "PERMANENT_DELETE" | "BROAD_PRIVILEGE" | "RETENTION_CHANGE" | "SENSITIVE_EXPORT",
    targetType: string,
    targetId: string,
    reason: string,
  ) {
    if (operation === "BROAD_PRIVILEGE") {
      const [accounts, groups] = await Promise.all([
        this.prisma.adminAccount.count({ where: { active: true } }),
        this.prisma.adminDirectoryGroup.count({ where: { active: true } }),
      ]);
      if (accounts + groups <= 1) return "";
    }
    const approved = await this.prisma.sensitiveOperationApproval.findFirst({
      where: { operation, targetType, targetId, requestedBy: req.identity.username, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
    });
    if (approved) return approved.id;
    const pending = await this.prisma.sensitiveOperationApproval.findFirst({
      where: { operation, targetType, targetId, requestedBy: req.identity.username, status: "PENDING" },
    });
    const approval = pending || (await this.prisma.sensitiveOperationApproval.create({
      data: { operation, targetType, targetId, requestedBy: req.identity.username, reason },
    }));
    if (!pending) await this.notifyApprovers(approval);
    throw new ConflictException({
      message: "A second administrator must approve this sensitive operation",
      approvalRequired: true,
      approvalId: approval.id,
    });
  }

  execute(id: string) {
    if (!id) return Promise.resolve(null);
    return this.prisma.sensitiveOperationApproval.update({
      where: { id },
      data: { status: "EXECUTED" },
    });
  }
}
