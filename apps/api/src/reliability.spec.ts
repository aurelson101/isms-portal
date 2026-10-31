import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchOutbox, maintainHistory } from "./notification-outbox";
import { exclusiveScheduler } from "./scheduler-lock";
import { healthyWorker } from "./worker-health";
import { metricRoute } from "./metric-route";

afterEach(() => vi.unstubAllEnvs());
describe("durable notifications and maintenance", () => {
  const setup = () => ({
    notificationOutbox: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: "event", payload: { action: "document.publish" }, attempts: 0 },
        ]),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
  });
  it("marks an event only after queue acceptance", async () => {
    const db = setup(),
      enqueue = vi.fn().mockResolvedValue(undefined);
    await dispatchOutbox(db as never, { enqueue });
    expect(enqueue).toHaveBeenCalledWith(
      { action: "document.publish" },
      "event",
    );
    expect(db.notificationOutbox.update).toHaveBeenCalledWith({
      where: { id: "event" },
      data: { queuedAt: expect.any(Date), attempts: { increment: 1 } },
    });
  });
  it("retains failed events and backs off without exposing transport errors", async () => {
    const db = setup(),
      now = new Date("2026-10-14T12:00:00Z");
    const output = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    await dispatchOutbox(
      db as never,
      {
        enqueue: vi
          .fn()
          .mockRejectedValue(new Error("private transport secret")),
      },
      now,
    );
    expect(db.notificationOutbox.update).toHaveBeenCalledWith({
      where: { id: "event" },
      data: {
        attempts: { increment: 1 },
        nextAttemptAt: new Date(now.getTime() + 30000),
      },
    });
    expect(String(output.mock.calls[0][0])).not.toContain(
      "private transport secret",
    );
    output.mockRestore();
  });
  it("never purges audits by default or removes undelivered events", async () => {
    vi.stubEnv("AUDIT_RETENTION_DAYS", "0");
    const db = setup();
    db.notificationOutbox.findMany.mockResolvedValue([]);
    await maintainHistory(db as never);
    expect(db.auditEvent.findMany).not.toHaveBeenCalled();
    expect(db.notificationOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { queuedAt: { lt: expect.any(Date) } },
        take: 1000,
      }),
    );
  });
  it("uses the approved age policy in bounded background batches", async () => {
    vi.stubEnv("AUDIT_RETENTION_DAYS", "365");
    const db = setup();
    const now = new Date("2026-10-14T12:00:00Z");
    await maintainHistory(db as never, now);
    expect(db.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { occurredAt: { lt: new Date(now.getTime() - 365 * 86400000) } },
        take: 1000,
      }),
    );
  });
});
describe("exclusive scheduling", () => {
  it("skips work when another worker owns the database lock", async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ acquired: false }]) },
      work = vi.fn();
    const tick = exclusiveScheduler({
      $transaction: vi.fn((callback) => callback(tx)),
    } as never);
    expect(await tick(work)).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });
  it("prevents local overlap and releases the guard after an error", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tx = { $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]) };
    const tick = exclusiveScheduler({
      $transaction: vi.fn((callback) => callback(tx)),
    } as never);
    const first = tick(async () => gate);
    expect(await tick(vi.fn())).toBe(false);
    release();
    expect(await first).toBe(true);
    await expect(
      tick(async () => {
        throw new Error("failure");
      }),
    ).rejects.toThrow("failure");
    expect(await tick(async () => undefined)).toBe(true);
  });
});
describe("health and bounded metrics", () => {
  it.each([
    null,
    {},
    { checkedAt: 0, mailRunning: true, directoryRunning: true },
    { checkedAt: 200001, mailRunning: true, directoryRunning: true },
    { checkedAt: 200000, mailRunning: false, directoryRunning: true },
  ])("rejects stale or incomplete worker health %j", (data) => {
    expect(healthyWorker(data, 200000)).toBe(false);
  });
  it("accepts a recent scheduler and two running processors", () => {
    expect(
      healthyWorker(
        { checkedAt: 190000, mailRunning: true, directoryRunning: true },
        200000,
      ),
    ).toBe(true);
  });
  it.each([undefined, null, [], ""])(
    "groups unknown routes under one label %j",
    (value) => {
      expect(metricRoute(value)).toBe("unmatched");
    },
  );
  it("keeps known route templates", () => {
    expect(metricRoute("/documents/:id")).toBe("/documents/:id");
  });
});
