import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";
import { GovernanceController } from "./governance.controller";
import { GovernanceBulkDto } from "./governance.dto";

const id = "00000000-0000-4000-8000-000000000001";
const request = { identity: { username: "admin", groups: ["ISMS-LOCAL-ADMINS"] } } as never;
const setup = () => {
  const prisma = {
    documentReview: { findMany: vi.fn(), updateMany: vi.fn() },
    incidentCase: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const audit = { record: vi.fn() };
  const controller = new GovernanceController(prisma as never, audit as never, {} as never, {} as never, {} as never, {} as never);
  return { controller, prisma, audit };
};

describe("governance bulk security", () => {
  it.each(["IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"])("blocks bulk review status %s before any database access", async value => {
    const { controller, prisma, audit } = setup();
    const payload = { kind: "REVIEW_STATUS", ids: [id], value, confirmed: true } as never;
    await expect(controller.bulkPreview(payload)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.bulkApply(request, payload)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentReview.findMany).not.toHaveBeenCalled();
    expect(prisma.documentReview.updateMany).not.toHaveBeenCalled();
    expect(prisma.incidentCase.findMany).not.toHaveBeenCalled();
    expect(prisma.incidentCase.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects bulk review requests through DTO validation", async () => {
    const payload = Object.assign(new GovernanceBulkDto(), { kind: "REVIEW_STATUS", ids: [id], value: "APPROVED", confirmed: true });
    expect(await validate(payload)).toEqual(expect.arrayContaining([expect.objectContaining({ property: "kind" })]));
  });

  it("preserves validated and audited bulk incident changes", async () => {
    const { controller, prisma, audit } = setup();
    prisma.incidentCase.findMany.mockResolvedValue([{ id, status: "OPEN", rootCause: "Verified cause" }]);
    const payload: GovernanceBulkDto = { kind: "INCIDENT_STATUS", ids: [id], value: "CLOSED", confirmed: true };
    expect(await validate(Object.assign(new GovernanceBulkDto(), payload))).toEqual([]);
    await expect(controller.bulkApply(request, payload)).resolves.toMatchObject({ applied: true, count: 1 });
    expect(prisma.incidentCase.updateMany).toHaveBeenCalledWith({ where: { id: { in: [id] } }, data: { status: "CLOSED" } });
    expect(audit.record).toHaveBeenCalledWith(request, "governance.bulk", "INCIDENT_STATUS", "success", { count: 1, value: "CLOSED" });
  });

  it("requires confirmation for bulk incidents", async () => {
    const { controller, prisma } = setup();
    await expect(controller.bulkApply(request, { kind: "INCIDENT_STATUS", ids: [id], value: "OPEN" })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.incidentCase.updateMany).not.toHaveBeenCalled();
  });

  it("still blocks closing incidents without a root cause", async () => {
    const { controller, prisma } = setup();
    prisma.incidentCase.findMany.mockResolvedValue([{ id, status: "OPEN", rootCause: "" }]);
    await expect(controller.bulkApply(request, { kind: "INCIDENT_STATUS", ids: [id], value: "CLOSED", confirmed: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.incidentCase.updateMany).not.toHaveBeenCalled();
  });
});
