import "reflect-metadata";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { GovernanceController } from "./governance.controller";

const setup = () => {
  const prisma = { documentReview: { findUnique: vi.fn() } };
  const storage = { getObject: vi.fn().mockResolvedValue(Readable.from([Buffer.from("image")])), putObject: vi.fn() };
  const antivirus = { scan: vi.fn() };
  const controller = new GovernanceController(prisma as never, {} as never, {} as never, {} as never, storage as never, antivirus as never);
  const response = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), { setHeader: vi.fn() });
  return { controller, prisma, storage, antivirus, response };
};

describe("review evidence security", () => {
  it("protects evidence routes with the approver role guard", () => {
    const { controller } = setup();
    for (const handler of [controller.reviewEvidence, controller.attachReviewEvidence]) {
      expect(Reflect.getMetadata("approver", handler)).toBe(true);
      expect(Reflect.getMetadata("admin", handler)).toBe(false);
    }
  });

  it("prevents caching and MIME sniffing of private evidence", async () => {
    const { controller, prisma, storage, response } = setup();
    prisma.documentReview.findUnique.mockResolvedValue({ evidenceObjectKey: "review-evidence/image", evidenceMimeType: "image/png", evidenceOriginalName: "proof.png" });
    await controller.reviewEvidence("review", response as never);
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(storage.getObject).toHaveBeenCalledWith("review-evidence/image");
  });

  it("does not open storage for absent evidence", async () => {
    const { controller, storage, response } = setup();
    await expect(controller.reviewEvidence("review", response as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it("rejects evidence uploaded by anyone other than the decision author", async () => {
    const { controller, prisma, storage, antivirus } = setup();
    prisma.documentReview.findUnique.mockResolvedValue({ decidedAt: new Date(), decidedBy: "approver" });
    const request = { identity: { username: "other-admin" } } as never;
    await expect(controller.attachReviewEvidence(request, "review", { originalname: "proof.png", mimetype: "image/png" } as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(antivirus.scan).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });
});
