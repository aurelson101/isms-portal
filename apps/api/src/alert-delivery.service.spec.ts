import { describe, expect, it, vi } from "vitest";
import { AlertDeliveryService } from "./alert-delivery.service";

describe("AlertDeliveryService", () => {
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
});
