import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { integrationArtifact, integrationArtifacts } from "./integration-artifacts";
import "reflect-metadata";
import { afterEach, vi } from "vitest";
import { OperationsController } from "./user-tools.controller";

afterEach(() => vi.unstubAllGlobals());

describe("monitoring artifacts", () => {
  it.each(Object.keys(integrationArtifacts))("provides the real %s artifact", (tool) => {
    expect(integrationArtifact(tool).content.length).toBeGreaterThan(100);
  });
  it.each(["constructor", "toString", "__proto__", "../secrets"])("rejects inherited or path keys: %s", (tool) => {
    expect(() => integrationArtifact(tool)).toThrow();
  });
  it("rejects unknown artifact variants", () => expect(() => integrationArtifact("wazuh", "../../.env")).toThrow());
  it("rejects credentials and unsafe schemes in portal URLs", () => {
    for (const url of ["https://user:password@example.test", "file:///etc/passwd", "invalid"]) expect(() => integrationArtifact("zabbix", "default", url)).toThrow();
  });
  it("generates a parsed Zabbix template with safe origin and UUIDs", () => {
    const artifact = integrationArtifact("zabbix", "default", "https://portal.example.test/admin#observability");
    const config = load(artifact.content) as any;
    const template = config.zabbix_export.templates[0];
    expect(template.macros[0].value).toBe("https://portal.example.test");
    const uuids: string[] = [];
    function visit(value: any) { if (!value || typeof value !== "object") return; if (value.uuid) uuids.push(value.uuid); Object.values(value).forEach(visit); }
    visit(config); expect(new Set(uuids).size).toBe(uuids.length);
    expect(uuids.every((uuid) => /^[a-f0-9]{32}$/.test(uuid))).toBe(true);
    expect(template.items.filter((item: any) => item.type === "DEPENDENT")).toHaveLength(4);
    expect(template.items.every((item: any) => item.type !== "HTTP_AGENT" || item.verify_peer === "YES")).toBe(true);
  });
  it("ships parseable Prometheus config and dependency alerts", () => {
    const config = load(integrationArtifact("prometheus").content) as any;
    expect(config.scrape_configs[0].static_configs[0].targets).toEqual(["api:3001"]);
    const alerts = load(integrationArtifact("prometheus", "alerts").content) as any;
    expect(alerts.groups[0].rules.some((rule: any) => rule.expr === "isms_service_health == 0")).toBe(true);
  });
  it("ships JSON test events without credentials", () => {
    const events = integrationArtifact("wazuh", "samples").content.trim().split("\n").map((line) => JSON.parse(line));
    expect(events).toHaveLength(4); expect(events.every((event) => event.service === "api" && !event.password)).toBe(true);
  });
  it("requires explicit TLS certificate paths in the Docker overlay", () => {
    const config = load(integrationArtifact("syslog", "compose").content) as any;
    for (const service of Object.values(config.services) as any[]) {
      expect(service.logging.options["syslog-tls-skip-verify"]).toBe("false");
      expect(service.logging.options["syslog-address"]).toContain(":?");
      expect(service.logging.options["syslog-tls-key"]).toContain("SYSLOG_TLS_KEY");
    }
  });
  it("does not report readiness when local health checks fail", async () => {
    const controller = new OperationsController({ applicationSetting: { findUnique: async () => ({ value: { enabled: true } }) } } as never, {} as never, {} as never, {} as never, {} as never);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url.endsWith("/metrics") ? "isms_service_health 1" : JSON.stringify({ status: "error" }), { status: url.endsWith("/metrics") ? 200 : 503 })));
    const result = await controller.testIntegration("zabbix");
    expect(result.applicationHealthy).toBe(false); expect(result.externalConnectivityVerified).toBe(false);
    expect(result.artifactsAvailable).toBe(true);
  });
  it("reports disconnected local endpoints without a false success", async () => {
    const controller = new OperationsController({ applicationSetting: { findUnique: async () => null } } as never, {} as never, {} as never, {} as never, {} as never);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Disconnected"); }));
    const result = await controller.testIntegration("prometheus");
    expect(result.applicationHealthy).toBe(false); expect(result.metricsAvailable).toBe(false); expect(result.configured).toBe(false);
  });
});
