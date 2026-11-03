import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./controllers";

describe("admin audit list", () => {
  it("serializes the audit chain index", async () => {
    const event = {
      id: "event-1",
      occurredAt: new Date("2026-11-03T10:00:00Z"),
      action: "document.publish",
      result: "success",
      chainIndex: BigInt(42),
    };
    const prisma = {
      auditEvent: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            event,
            { ...event, id: "event-2", chainIndex: null },
          ]),
        count: vi.fn().mockResolvedValue(2),
      },
    };
    const controller = new AdminController(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await controller.auditEvents("1", "50");

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.items.map((item) => item.chainIndex)).toEqual(["42", null]);
  });
});
