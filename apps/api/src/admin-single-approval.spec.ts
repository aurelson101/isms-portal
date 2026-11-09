import { describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  SensitiveApprovalService,
  requiresIndependentApproval,
} from "./sensitive-approval.service";
import { ApprovalsController } from "./approvals.controller";
import { GovernanceController } from "./governance.controller";

const request = {
  identity: { username: "admin", groups: ["ISMS-LOCAL-ADMINS"] },
} as never;
function setup(operation = "BROAD_PRIVILEGE", targetType = "ADMIN_ACCOUNT") {
  const item = {
    id: "approval",
    operation,
    targetType,
    requestedBy: "ADMIN",
    status: "PENDING",
  };
  const prisma = {
    sensitiveOperationApproval: {
      findUnique: vi.fn().mockResolvedValue(item),
      findMany: vi.fn().mockResolvedValue([item]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ ...item, status: "APPROVED" }),
    },
    userNotification: { create: vi.fn() },
  };
  const audit = { record: vi.fn() };
  return {
    prisma,
    audit,
    controller: new ApprovalsController(prisma as never, audit as never),
    governance: new GovernanceController(
      prisma as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
  };
}
describe("single administrator approval for admin accounts and groups", () => {
  it.each(["ADMIN_ACCOUNT", "ADMIN_DIRECTORY_GROUP"])(
    "does not request a second administrator for %s",
    async (target) => {
      const service = new SensitiveApprovalService({} as never, {} as never);
      await expect(
        service.require(
          request,
          "BROAD_PRIVILEGE",
          target,
          "target",
          "Approved access request",
        ),
      ).resolves.toBe("");
      const h = setup("BROAD_PRIVILEGE", target);
      expect((await h.controller.list(request))[0].canDecide).toBe(true);
      await h.controller.decide(request, "approval", { status: "APPROVED" });
      expect(h.prisma.sensitiveOperationApproval.updateMany).toHaveBeenCalled();
      expect(h.audit.record).toHaveBeenCalled();
      await h.governance.decideSensitiveApproval(request, "approval", {
        status: "APPROVED",
      });
    },
  );
  it.each(["PERMANENT_DELETE", "RETENTION_CHANGE", "SENSITIVE_EXPORT"])(
    "retains independent approval for %s",
    async (operation) => {
      expect(requiresIndependentApproval(operation, "ADMIN_ACCOUNT")).toBe(
        true,
      );
      const h = setup(operation);
      expect((await h.controller.list(request))[0].canDecide).toBe(false);
      await expect(
        h.controller.decide(request, "approval", { status: "APPROVED" }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        h.governance.decideSensitiveApproval(request, "approval", {
          status: "APPROVED",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        h.prisma.sensitiveOperationApproval.updateMany,
      ).not.toHaveBeenCalled();
    },
  );
  it("keeps privileged decisions restricted to administrators", async () => {
    const h = setup();
    await expect(
      h.controller.decide(
        { identity: { username: "reader", groups: [] } } as never,
        "approval",
        { status: "APPROVED" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      h.prisma.sensitiveOperationApproval.updateMany,
    ).not.toHaveBeenCalled();
  });
});
