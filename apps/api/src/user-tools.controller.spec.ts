import { describe, expect, it, vi } from "vitest";
import { OperationsController } from "./user-tools.controller";

const request = {
  identity: { username: "admin", groups: ["ISMS-LOCAL-ADMINS"] },
  ip: "127.0.0.1",
  correlationId: "test",
} as never;

describe("OperationsController user requests", () => {
  it("deletes every request type, related notifications and attachments", async () => {
    const transactionClient = {
      userNotification: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      accessRequest: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      documentReport: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      securityReport: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      securityReport: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ attachmentObjectKey: "reports/proof.pdf" }]),
      },
      $transaction: vi.fn((callback) => callback(transactionClient)),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const storage = { removeObject: vi.fn().mockResolvedValue(undefined) };
    const controller = new OperationsController(
      prisma as never,
      audit as never,
      storage as never,
    );

    await expect(controller.deleteAllWorkItems(request)).resolves.toEqual({
      deleted: {
        accessRequests: 2,
        documentReports: 3,
        securityReports: 1,
        notifications: 4,
      },
      attachmentFailures: 0,
    });
    expect(storage.removeObject).toHaveBeenCalledWith("reports/proof.pdf");
    expect(audit.record).toHaveBeenCalledWith(
      request,
      "user-requests.delete-all",
      "user-requests:all",
      "success",
      expect.objectContaining({ documentReports: 3, attachmentFailures: 0 }),
    );
  });
});
