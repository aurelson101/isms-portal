import { AuditService } from "./audit.service";
import { describe, expect, it, vi } from "vitest";

describe("AuditService", () => {
  it("emits a structured SIEM event without audit details", async () => {
    const event = {
      id: "audit-1",
      identity: "alice",
      ipAddress: "192.0.2.10",
      action: "document.read",
      resource: "document:1",
      result: "success",
      correlationId: "correlation-1",
      occurredAt: new Date("2026-08-24T10:00:00.000Z"),
      details: { secret: "must-not-be-logged" },
    };
    const transaction = {
      $executeRaw: vi.fn(),
      auditEvent: {
        create: vi.fn().mockResolvedValue(event),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback) => callback(transaction)),
    };
    const output = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await new AuditService(
      prisma as never,
      { evaluate: vi.fn(async () => undefined) } as never,
    ).record(
      {
        identity: { username: "alice" },
        ip: "192.0.2.10",
        correlationId: "correlation-1",
      } as never,
      "document.read",
      "document:1",
      "success",
      { secret: "must-not-be-logged" },
    );

    const logged = String(output.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toMatchObject({
      service: "api",
      event: "audit",
      identity: "alice",
      action: "document.read",
      correlationId: "correlation-1",
    });
    expect(logged).not.toContain("must-not-be-logged");
    output.mockRestore();
  });
});
