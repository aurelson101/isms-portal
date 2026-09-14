import { describe, expect, it, vi } from "vitest";
import {
  AlertDeliveryService,
  isAllowedTeamsWebhookHost,
} from "./alert-delivery.service";

describe("AlertDeliveryService", () => {
  it("uses valid AD mail recipients and HTML without SMTP fallback", async () => {
    const service = new AlertDeliveryService({ applicationSetting: { findUnique: vi.fn().mockResolvedValue({ value: { graphTenantId: "tenant", graphClientId: "client", graphCertificatePemEncrypted: "cert", graphPrivateKeyPemEncrypted: "key" } }) } } as never, {} as never);
    const graph = vi.spyOn(service as any, "graph").mockResolvedValue(undefined);
    await service.sendPreferredTo(["First.Last@example.com", "first.last@example.com", "invalid"], "Document published", "Content");
    expect(graph).toHaveBeenCalledWith(expect.anything(), "Document published", "Content", ["first.last@example.com"], expect.stringContaining('lang="en"'));
    await expect(service.sendPreferredTo(["not an email"], "Title", "Content")).rejects.toThrow("No eligible mail recipients");
  });
  it("accepts legacy and Power Automate Teams webhook hosts only", () => {
    expect(isAllowedTeamsWebhookHost("tenant.webhook.office.com")).toBe(true);
    expect(isAllowedTeamsWebhookHost("region.logic.azure.com")).toBe(true);
    expect(
      isAllowedTeamsWebhookHost(
        "default123.0a.environment.api.powerplatform.com",
      ),
    ).toBe(true);
    expect(isAllowedTeamsWebhookHost("powerplatform.com.example.org")).toBe(
      false,
    );
    expect(
      isAllowedTeamsWebhookHost("environment.api.powerplatform.com.evil"),
    ).toBe(false);
  });

  it("encrypts secrets and never returns them", async () => {
    let stored: { value?: unknown } | null = null;
    const prisma = {
      applicationSetting: {
        findUnique: vi.fn(async () => stored),
        upsert: vi.fn(async ({ create }: { create: { value: unknown } }) => {
          stored = { value: create.value };
        }),
      },
    };
    const secrets = new Map<string, string>();
    const crypto = {
      encrypt: vi.fn((value: string) => {
        const reference = `encrypted-${secrets.size + 1}`;
        secrets.set(reference, value);
        return reference;
      }),
      decrypt: vi.fn((value: string) => secrets.get(value) || ""),
    };
    const service = new AlertDeliveryService(prisma as never, crypto as never);
    const result = await service.save({
      smtpHost: "smtp.example.com",
      smtpPort: "587",
      smtpStartTls: true,
      smtpFrom: "isms@example.com",
      smtpRecipients: "soc@example.com, admin@example.com",
      smtpPassword: "smtp-secret",
      slackWebhookUrl: "https://hooks.slack.com/services/secret",
    });
    expect(JSON.stringify(stored)).not.toContain("smtp-secret");
    expect(JSON.stringify(stored)).not.toContain("hooks.slack.com");
    expect(result.smtpPassword).toBe("********");
    expect(result.slackWebhookUrl).toBe("********");
    expect(result.configured.email).toBe(true);
  });

  it("rejects invalid email recipients", async () => {
    const prisma = {
      applicationSetting: { findUnique: vi.fn(async () => null) },
    };
    const service = new AlertDeliveryService(prisma as never, {} as never);
    await expect(
      service.save({ smtpRecipients: "not-an-email" }),
    ).rejects.toThrow("Invalid email address");
  });

  it("prefers SMTP and falls back to Teams when delivery fails", async () => {
    const prisma = {
      applicationSetting: {
        findUnique: vi.fn(async () => ({
          value: {
            smtpHost: "smtp.example.com",
            smtpFrom: "isms@example.com",
            smtpRecipients: ["soc@example.com"],
            teamsWebhookUrlEncrypted: "encrypted-teams",
          },
        })),
      },
    };
    const service = new AlertDeliveryService(prisma as never, {} as never);
    const send = vi
      .spyOn(service, "send")
      .mockRejectedValueOnce(new Error("SMTP unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(service.sendPreferred("Subject", "Message")).resolves.toEqual({
      delivered: true,
      channel: "teams",
      attempted: ["email", "teams"],
    });
    expect(send.mock.calls.map(([channel]) => channel)).toEqual([
      "email",
      "teams",
    ]);
  });

  it("does nothing when no outbound channel is configured", async () => {
    const prisma = {
      applicationSetting: { findUnique: vi.fn(async () => null) },
    };
    const service = new AlertDeliveryService(prisma as never, {} as never);
    await expect(service.sendPreferred("Subject", "Message")).resolves.toEqual({
      delivered: false,
      channel: null,
      attempted: [],
    });
  });
});
