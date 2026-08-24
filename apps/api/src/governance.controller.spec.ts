import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GovernanceController } from "./governance.controller";

const request = {
  identity: { username: "admin", groups: ["ISMS-LOCAL-ADMINS"] },
  ip: "127.0.0.1",
  correlationId: "test",
} as never;

const setup = (overrides: Record<string, unknown> = {}) => {
  const prisma = {
    document: { findFirst: vi.fn() },
    documentVersion: { findFirst: vi.fn() },
    documentReview: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    accessRule: { findUnique: vi.fn(), update: vi.fn() },
    retentionPolicy: { findUnique: vi.fn(), update: vi.fn() },
    incidentCase: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    adminSavedView: { deleteMany: vi.fn() },
    ...overrides,
  };
  const audit = { record: vi.fn() };
  return {
    prisma,
    audit,
    controller: new GovernanceController(prisma as never, audit as never),
  };
};

describe("GovernanceController", () => {
  it("requires three distinct actors for a document review", async () => {
    const { controller } = setup();
    await expect(
      controller.createReview(request, {
        documentId: "00000000-0000-4000-8000-000000000001",
        owner: "alice",
        reviewer: "Alice",
        approver: "bob",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("makes lifetime group access explicitly non-expiring", async () => {
    const { controller, prisma } = setup();
    prisma.accessRule.findUnique.mockResolvedValue({
      id: "rule",
      validUntil: new Date("2030-01-01"),
    });
    prisma.accessRule.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: "rule", group: {}, space: {}, ...data }),
    );
    const result = await controller.certifyAccess(request, "rule", {
      lifetime: true,
      justification: "Permanent business access",
    });
    expect(result.lifetime).toBe(true);
    expect(result.validUntil).toBeNull();
    expect(result.certificationDueAt).toBeNull();
  });

  it("blocks every destruction decision while a legal hold is active", async () => {
    const { controller, prisma } = setup();
    prisma.retentionPolicy.findUnique.mockResolvedValue({
      id: "policy",
      legalHold: true,
    });
    await expect(
      controller.retentionDecision(request, "policy", {
        action: "REQUEST",
        reason: "End of retention",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires a second administrator for destruction approval", async () => {
    const { controller, prisma } = setup();
    prisma.retentionPolicy.findUnique.mockResolvedValue({
      id: "policy",
      legalHold: false,
      destructionStatus: "REQUESTED",
      requestedBy: "admin",
    });
    await expect(
      controller.retentionDecision(request, "policy", {
        action: "APPROVE",
        reason: "Approval",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not allow deleting another administrator saved view", async () => {
    const { controller, prisma } = setup();
    prisma.adminSavedView.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      controller.deleteView(request, "foreign-view"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.adminSavedView.deleteMany).toHaveBeenCalledWith({
      where: { id: "foreign-view", identity: "admin" },
    });
  });

  it("rejects bulk changes when a review is already closed", async () => {
    const { controller, prisma } = setup();
    prisma.documentReview.findMany.mockResolvedValue([]);
    await expect(
      controller.bulkPreview({
        kind: "REVIEW_STATUS",
        ids: ["00000000-0000-4000-8000-000000000001"],
        value: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("requires a root cause before resolving an incident", async () => {
    const { controller, prisma } = setup();
    prisma.incidentCase.findUnique.mockResolvedValue({
      id: "incident",
      status: "OPEN",
    });
    await expect(
      controller.updateIncident(request, "incident", {
        reference: "INC-1",
        title: "Security incident",
        severity: "HIGH",
        status: "RESOLVED",
        owner: "alice",
        occurredAt: new Date().toISOString(),
        rootCause: "",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
