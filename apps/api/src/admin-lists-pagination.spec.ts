import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./controllers";

describe.each([
  ["groups", "directoryGroup"],
  ["rules", "accessRule"],
  ["auditEvents", "auditEvent"],
] as const)("Admin %s pagination", (method, model) => {
  function setup() {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(41);
    const controller = new AdminController({ [model]: { findMany, count } } as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const list = (page?: string, limit?: string) => method === "auditEvents"
      ? controller.auditEvents(page, limit)
      : controller[method]("", page, limit);
    return { controller, findMany, count, list };
  }

  it.each([
    ["2", "20", 2, 20],
    ["1.5", "20.5", 1, 50],
    ["Infinity", "Infinity", 1, 50],
    ["NaN", "NaN", 1, 50],
    ["-1", "0", 1, 50],
    ["9007199254740992", "999", 1, 200],
    ["1000001", "200", 1000000, 200],
  ])("bounds page %s and limit %s before database access", async (requestedPage, requestedLimit, page, limit) => {
    const h = setup();
    expect(await h.list(String(requestedPage), String(requestedLimit))).toMatchObject({ page, limit, total: 41 });
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: (Number(page) - 1) * Number(limit), take: limit }));
    expect(h.count).toHaveBeenCalledWith({ where: {} });
    expect(h.findMany.mock.calls[0][0].orderBy.at(-1)).toEqual({ id: "asc" });
  });

  if (method !== "auditEvents") {
    it("preserves the unpaginated response used by existing selectors", async () => {
      const h = setup();
      expect(await h.list()).toEqual([]);
      const options = h.findMany.mock.calls[0][0];
      expect(options).not.toHaveProperty("skip");
      expect(options).not.toHaveProperty("take");
      expect(h.count).not.toHaveBeenCalled();
    });
  }
  if (method === "groups") {
    it.each(["name", "memberCount", "lastSyncedAt"])("preserves %s sorting and adds a unique tie breaker", async sort => {
      const h = setup();
      await h.controller.groups("", "1", "20", sort, "desc");
      expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ [sort]: "desc" }, { id: "asc" }] }));
    });
  }
});
