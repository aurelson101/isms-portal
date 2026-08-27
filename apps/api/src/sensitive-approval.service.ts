import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import type { IsmsRequest } from "./types";

@Injectable()
export class SensitiveApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async require(
    req: IsmsRequest,
    operation:
      | "PERMANENT_DELETE"
      | "BROAD_PRIVILEGE"
      | "RETENTION_CHANGE"
      | "SENSITIVE_EXPORT",
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
      where: {
        operation,
        targetType,
        targetId,
        requestedBy: req.identity.username,
        status: "APPROVED",
      },
      orderBy: { approvedAt: "desc" },
    });
    if (approved) return approved.id;
    const pending = await this.prisma.sensitiveOperationApproval.findFirst({
      where: {
        operation,
        targetType,
        targetId,
        requestedBy: req.identity.username,
        status: "PENDING",
      },
    });
    const approval =
      pending ||
      (await this.prisma.sensitiveOperationApproval.create({
        data: {
          operation,
          targetType,
          targetId,
          requestedBy: req.identity.username,
          reason,
        },
      }));
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
