import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./controllers";

function setup(identity = "viewer") {
  const groups = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
  const rules = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) };
  const items = [{ occurredAt: new Date("2026-01-01T00:00:00Z"), identity, ipAddress: "127.0.0.1", action: "document.read", resource: "document:test", result: "success", correlationId: "test" }];
  const events = { findMany: vi.fn().mockResolvedValue(items), count: vi.fn().mockResolvedValue(1) };
  const prisma = { directoryGroup: groups, accessRule: rules, auditEvent: events };
  const approvals = { require: vi.fn().mockResolvedValue("approval"), execute: vi.fn().mockResolvedValue(undefined) };
  const controller = new AdminController(prisma as never, {} as never, {} as never, {} as never, {} as never, approvals as never);
  const response = { type: vi.fn(), attachment: vi.fn(), send: vi.fn() };
  response.type.mockReturnValue(response);
  response.attachment.mockReturnValue(response);
  const req = {} as Parameters<AdminController["exportAudit"]>[0];
  return { groups, rules, events, approvals, controller, response, req };
}

function list(h: ReturnType<typeof setup>, kind: "groups" | "rules", query: unknown = "", order: unknown = "asc") {
  return kind === "groups"
    ? h.controller.groups(query as never, "1", "20", "name", order as never)
    : h.controller.rules(query as never, "1", "20", order as never);
}

describe("administration query validation", () => {
  it.each(["groups", "rules"] as const)("rejects non-string %s searches without querying the database", async kind => {
    for (const query of [null, ["first", "second"], { name: "group" }]) {
      const h = setup();
      await expect(list(h, kind, query)).rejects.toBeInstanceOf(BadRequestException);
      expect(h.groups.findMany).not.toHaveBeenCalled();
      expect(h.rules.findMany).not.toHaveBeenCalled();
    }
  });

  it.each(["groups", "rules"] as const)("rejects invalid %s ordering without querying the database", async kind => {
    for (const order of ["ASC", "", "unknown", ["asc", "desc"], {}]) {
      const h = setup();
      await expect(list(h, kind, "", order)).rejects.toBeInstanceOf(BadRequestException);
      expect(h.groups.findMany).not.toHaveBeenCalled();
      expect(h.rules.findMany).not.toHaveBeenCalled();
    }
  });

  it.each(["groups", "rules"] as const)("preserves valid %s pagination and ordering", async kind => {
    for (const order of ["asc", "desc"]) {
      const h = setup();
      await expect(list(h, kind, " team ", order)).resolves.toMatchObject({ page: 1, limit: 20, items: [] });
      const mock = kind === "groups" ? h.groups : h.rules;
      expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
      expect(mock.count).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    { action: null, result: undefined },
    { action: ["read", "write"], result: undefined },
    { action: undefined, result: null },
    { action: undefined, result: ["success", "failure"] },
    { action: "a".repeat(201), result: undefined },
    { action: undefined, result: "r".repeat(65) },
  ])("rejects malformed or oversized audit filters", async ({ action, result }) => {
    const h = setup();
    await expect(h.controller.auditEvents("1", "20", action as never, result as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.events.findMany).not.toHaveBeenCalled();
    expect(h.events.count).not.toHaveBeenCalled();
  });

  it("accepts audit filters at their supported length limits", async () => {
    const h = setup();
    await expect(h.controller.auditEvents("1", "20", "a".repeat(200), "r".repeat(64))).resolves.toMatchObject({ page: 1, limit: 20 });
    expect(h.events.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: { contains: "a".repeat(200), mode: "insensitive" }, result: "r".repeat(64) },
    }));
  });
});

describe("audit export safety", () => {
  it.each(["=1+1", "+SUM(1,2)", "-3+4", "@SUM(1,2)", "\t=1", "\r=1", "\n=1", " =1", "\uFEFF=1", "\uFF1D1+1", "\uFF0B1+1", "\uFF0D1+1", "\uFF201+1", '=1";=2'])("neutralizes formula-like cell %j in CSV", async identity => {
    const h = setup(identity);
    await h.controller.exportAudit(h.req, h.response as never, "csv");
    expect(h.response.send.mock.calls[0][0]).toContain(',"\t' + identity.replace(/"/g, '""') + '",');
  });

  it("keeps ordinary CSV quoting and multiline fields intact", async () => {
    const h = setup('safe,"value"\ncontinued');
    await h.controller.exportAudit(h.req, h.response as never, "csv");
    expect(h.response.send.mock.calls[0][0]).toContain(',"safe,""value""\ncontinued",');
  });

  it("exports in deterministic order and leaves JSON values unchanged", async () => {
    const h = setup("=original");
    await h.controller.exportAudit(h.req, h.response as never, "json");
    expect(h.events.findMany).toHaveBeenCalledWith({ orderBy: [{ occurredAt: "desc" }, { id: "asc" }], take: 10000 });
    expect(JSON.parse(h.response.send.mock.calls[0][0])[0].identity).toBe("=original");
    expect(h.approvals.require).toHaveBeenCalledWith(h.req, "SENSITIVE_EXPORT", "AUDIT_LOG", "json", expect.any(String));
    expect(h.approvals.execute).toHaveBeenCalledWith("approval");
  });

  it("does not read or send audit data without the required approval", async () => {
    const h = setup();
    h.approvals.require.mockRejectedValueOnce(new Error("approval required"));
    await expect(h.controller.exportAudit(h.req, h.response as never, "csv")).rejects.toThrow("approval required");
    expect(h.events.findMany).not.toHaveBeenCalled();
    expect(h.approvals.execute).not.toHaveBeenCalled();
    expect(h.response.send).not.toHaveBeenCalled();
  });
});
