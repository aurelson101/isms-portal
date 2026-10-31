import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { BadRequestException, NotFoundException } from "@nestjs/common";

export const integrationArtifacts = {
  prometheus: {
    default: "deploy/monitoring/prometheus-isms.yml",
    alerts: "deploy/monitoring/prometheus-alerts.yml",
  },
  zabbix: { default: "deploy/monitoring/zabbix-isms-template.yaml" },
  wazuh: {
    default: "deploy/monitoring/wazuh-isms-rules.xml",
    agent: "deploy/monitoring/wazuh-isms-localfile.xml",
    samples: "deploy/monitoring/wazuh-isms-samples.jsonl",
  },
  syslog: {
    default: "deploy/monitoring/rsyslog-isms.conf.example",
    compose: "deploy/compose/observability-syslog.yml",
  },
} as const;

export function integrationArtifact(
  tool: string,
  variant = "default",
  portalUrl?: string,
) {
  if (!Object.hasOwn(integrationArtifacts, tool)) throw new NotFoundException();
  const files = integrationArtifacts[tool as keyof typeof integrationArtifacts];
  if (!Object.hasOwn(files, variant)) throw new NotFoundException();
  const relative = (files as Record<string, string>)[variant];
  const packaged = resolve(__dirname, "monitoring", basename(relative));
  const path = existsSync(packaged)
    ? packaged
    : resolve(__dirname, "../../..", relative);
  let url = "http://reverse-proxy:8080";
  if (portalUrl) {
    try {
      const parsed = new URL(portalUrl);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error("Invalid URL");
      url = parsed.origin;
    } catch {
      throw new BadRequestException("Invalid portal URL");
    }
  }
  return {
    filename: basename(relative),
    content: readFileSync(path, "utf8").replaceAll(
      '"http://reverse-proxy:8080"',
      JSON.stringify(url),
    ),
  };
}
