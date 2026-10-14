import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { statfs } from "node:fs/promises";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AlertPolicyDto } from "./user-tools.dto";
import { AlertDeliveryService } from "./alert-delivery.service";
import { collectHealthSnapshot, healthIncidents, type HealthSnapshot } from "./health-alerts";

vi.mock("node:fs/promises", () => ({ statfs: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const healthy: HealthSnapshot = { services: { api: true, postgres: true, redis: true, clamav: true, documentStorage: true }, disk: { availableBytes: 50, totalBytes: 100 } };
const outage: HealthSnapshot = { ...healthy, services: { ...healthy.services, redis: false }, disk: { availableBytes: 9, totalBytes: 100 } };

function fixture(channel = "teams", enabled = true) {
  const state = new Map<string, unknown>([["observability.alert-policy", { enabled, channel }]]);
  const upsert = vi.fn(async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => state.set(where.key, update.value));
  const service = new AlertDeliveryService({ applicationSetting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => state.has(where.key) ? { value: state.get(where.key) } : null), upsert,
  } } as never, {} as never);
  const send = vi.spyOn(service, "send").mockResolvedValue(undefined);
  const graph = vi.spyOn(service, "sendPreferredTo").mockResolvedValue({ delivered: true, channel: "graph", attempted: ["graph"] });
  const recipients = vi.fn().mockResolvedValue(["admin@example.com"]);
  return { service, state, upsert, send, graph, recipients };
}

describe("Infrastructure alerts", () => {
  it("accepts existing document alert settings and rejects invalid intervals", async () => {
    const policy = Object.assign(new AlertPolicyDto(), { enabled: true, channel: "teams-graph", fiveXxPercent: "5", deniedPerMinute: "20", documentAdded: true, documentUpdated: true, documentModified: false, documentDeleted: false, documentVersionOverdue: true, documentVersionMaxAgeDays: 365 });
    expect(await validate(policy, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(await validate(plainToInstance(AlertPolicyDto, { ...policy, documentVersionMaxAgeDays: "365" }))).toEqual([]);
    policy.documentVersionMaxAgeDays = 0;
    expect(await validate(policy)).not.toHaveLength(0);
  });

  it("checks disk boundaries, services and unavailable capacity", () => {
    expect(healthIncidents(healthy)).toEqual([]);
    expect(healthIncidents({ ...healthy, disk: { availableBytes: 10, totalBytes: 100 } })).toEqual([]);
    expect(healthIncidents(outage)).toEqual(["Service unavailable: redis", "Document storage has less than 10% free space."]);
    expect(healthIncidents({ ...healthy, disk: { availableBytes: 0, totalBytes: 100 } })).toHaveLength(1);
    expect(healthIncidents({ ...healthy, disk: null })).toHaveLength(1);
    expect(healthIncidents({ ...healthy, disk: { availableBytes: 0, totalBytes: 0 } })).toHaveLength(1);
  });

  it("collects internal readiness and disk capacity without redirects", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok", checks: healthy.services }) });
    vi.stubGlobal("fetch", fetch);
    vi.mocked(statfs).mockResolvedValue({ bavail: 10, blocks: 100, bsize: 1024 } as never);
    const snapshot = await collectHealthSnapshot();
    expect(snapshot.disk).toEqual({ availableBytes: 10240, totalBytes: 102400 });
    expect(healthIncidents(snapshot)).toEqual([]);
    expect(fetch).toHaveBeenCalledWith("http://api:3001/health/ready", expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("handles API 503 and missing service checks conservatively", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ checks: { ...healthy.services, clamav: false } }) }));
    vi.mocked(statfs).mockResolvedValue({ bavail: 50, blocks: 100, bsize: 1 } as never);
    expect(healthIncidents(await collectHealthSnapshot())).toEqual(["Service unavailable: api", "Service unavailable: clamav"]);
  });

  it("reports an unreachable API and unreadable disk without rejecting the check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    vi.mocked(statfs).mockRejectedValue(new Error("unavailable"));
    expect(healthIncidents(await collectHealthSnapshot())).toEqual(["Service unavailable: api", "Service unavailable: storageMetrics"]);
  });

  it.each(["teams", "email"])("sends a simulated outage through %s", async channel => {
    const f = fixture(channel);
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledWith(channel, "[ISMS Portal] Infrastructure alert", expect.stringContaining("redis"));
    expect(f.upsert).toHaveBeenCalledOnce();
    expect(f.recipients).not.toHaveBeenCalled();
  });

  it("resolves only staff recipients for Graph", async () => {
    const f = fixture("graph");
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.graph).toHaveBeenCalledWith(["admin@example.com"], expect.any(String), expect.any(String));
    expect(f.send).not.toHaveBeenCalled();
  });

  it("prioritizes Teams without sending duplicate mail", async () => {
    const f = fixture("teams-graph");
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledWith("teams", expect.any(String), expect.any(String));
    expect(f.graph).not.toHaveBeenCalled();
  });

  it("falls back to Graph on Teams failure and retries when both fail", async () => {
    const f = fixture("teams-graph");
    f.send.mockRejectedValue(new Error("Teams unavailable"));
    f.graph.mockRejectedValueOnce(new Error("Graph unavailable"));
    await expect(f.service.evaluateHealth(async () => outage, f.recipients)).rejects.toThrow("Graph unavailable");
    expect(f.upsert).not.toHaveBeenCalled();
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.graph).toHaveBeenCalledWith(["admin@example.com"], expect.any(String), expect.any(String));
    expect(f.upsert).toHaveBeenCalledOnce();
  });

  it.each([["teams", false], ["none", true], ["unknown", true]])("does not collect or send for channel %s enabled=%s", async (channel, enabled) => {
    const f = fixture(channel as string, enabled as boolean);
    const collect = vi.fn().mockResolvedValue(outage);
    await f.service.evaluateHealth(collect, f.recipients);
    expect(collect).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
  });

  it("suppresses repeats, sends recovery once and alerts for a new outage", async () => {
    const f = fixture();
    await f.service.evaluateHealth(async () => healthy, f.recipients);
    expect(f.send).not.toHaveBeenCalled();
    await f.service.evaluateHealth(async () => outage, f.recipients);
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledTimes(1);
    await f.service.evaluateHealth(async () => healthy, f.recipients);
    expect(f.send).toHaveBeenLastCalledWith("teams", "[ISMS Portal] Infrastructure recovered", expect.any(String));
    await f.service.evaluateHealth(async () => healthy, f.recipients);
    expect(f.send).toHaveBeenCalledTimes(2);
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("repeats unresolved alerts after the cooldown and respects a changed channel", async () => {
    const f = fixture();
    await f.service.evaluateHealth(async () => outage, f.recipients);
    const value = f.state.get("observability.health-alert-state") as Record<string, unknown>;
    f.state.set("observability.health-alert-state", { ...value, at: new Date(Date.now() - 16 * 60000).toISOString() });
    await f.service.evaluateHealth(async () => outage, f.recipients);
    f.state.set("observability.alert-policy", { enabled: true, channel: "email" });
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledTimes(3);
  });

  it("retries failures without advancing the successful delivery state", async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(f.service.evaluateHealth(async () => outage, f.recipients)).rejects.toThrow("provider unavailable");
    expect(f.upsert).not.toHaveBeenCalled();
    await f.service.evaluateHealth(async () => outage, f.recipients);
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.upsert).toHaveBeenCalledOnce();
  });

  it("does not send audit alerts when no channel is selected", async () => {
    const f = fixture("none");
    await f.service.evaluate("failure", f.recipients);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("sends a Teams adaptive card and rejects provider errors", async () => {
    const f = fixture();
    f.send.mockRestore();
    f.state.set("observability.alert-channels", { teamsWebhookUrlEncrypted: "encrypted" });
    vi.spyOn(f.service as unknown as { decrypt: (value: string) => string }, "decrypt").mockReturnValue("https://tenant.webhook.office.com/test");
    vi.spyOn(f.service as unknown as { safeWebhook: () => Promise<URL> }, "safeWebhook").mockResolvedValue(new URL("https://tenant.webhook.office.com/test"));
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetch);
    await f.service.send("teams", "Service alert", "Redis unavailable");
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.attachments[0].content.body[1].text).toBe("Redis unavailable");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
    await expect(f.service.send("teams", "Service alert", "Redis unavailable")).rejects.toThrow("HTTP 429");
  });
});
