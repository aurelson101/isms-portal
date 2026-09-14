import { BadRequestException, Injectable } from "@nestjs/common";
import { isIP } from "node:net";
import { connect as connectTcp, type Socket } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import { connect as connectTls, type TLSSocket } from "node:tls";
import { createHash, createSign, randomUUID, X509Certificate } from "node:crypto";
import { notificationHtml, portalLink, type EmailTemplate } from "./notification-email";
import { CryptoService } from "./crypto.service";
import { PrismaService } from "./prisma.service";

export type AlertChannel = "graph" | "email" | "teams" | "slack" | "webhook";
export type PreferredDelivery = {
  delivered: boolean;
  channel: AlertChannel | null;
  attempted: AlertChannel[];
};
export type DocumentAlertPolicy = {
  enabled: boolean;
  documentAdded: boolean;
  documentUpdated: boolean;
  documentModified: boolean;
  documentDeleted: boolean;
  documentVersionOverdue: boolean;
  documentVersionMaxAgeDays: number;
};
type StoredChannels = {
  graphTenantId?: string;
  graphClientId?: string;
  graphSender?: string;
  graphCertificatePemEncrypted?: string;
  graphPrivateKeyPemEncrypted?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpStartTls?: boolean;
  smtpUsername?: string;
  smtpPasswordEncrypted?: string;
  smtpFrom?: string;
  smtpRecipients?: string[];
  teamsWebhookUrlEncrypted?: string;
  slackWebhookUrlEncrypted?: string;
  genericWebhookUrlEncrypted?: string;
  genericWebhookSecretEncrypted?: string;
};

const SETTING_KEY = "observability.alert-channels";
const MASK = "********";
const base64Url = (value: Buffer | string) => Buffer.from(value).toString("base64").replace(/=/gu, "").replace(/\+/gu, "-").replace(/\//gu, "_");
export const isAllowedTeamsWebhookHost = (hostname: string) =>
  /(^|\.)webhook\.office\.com$|(^|\.)logic\.azure\.com$|(^|\.)environment\.api\.powerplatform\.com$/u.test(
    hostname,
  );
const privateAddress = (address: string) =>
  address === "::1" ||
  address === "0.0.0.0" ||
  address.startsWith("127.") ||
  address.startsWith("10.") ||
  address.startsWith("192.168.") ||
  /^172\.(1[6-9]|2\d|3[01])\./u.test(address) ||
  address.startsWith("169.254.") ||
  address.startsWith("fc") ||
  address.startsWith("fd") ||
  address.startsWith("fe80:");

@Injectable()
export class AlertDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  private async stored(): Promise<StoredChannels> {
    const setting = await this.prisma.applicationSetting.findUnique({
      where: { key: SETTING_KEY },
    });
    return (setting?.value || {}) as StoredChannels;
  }

  async publicConfiguration() {
    const value = await this.stored();
    return {
      graphTenantId: value.graphTenantId || "",
      graphClientId: value.graphClientId || "",
      graphSender: value.graphSender || "isms-app@deftagroup.com",
      graphCertificatePem: value.graphCertificatePemEncrypted ? MASK : "",
      graphPrivateKeyPem: value.graphPrivateKeyPemEncrypted ? MASK : "",
      graphThumbprint: this.graphThumbprint(value),
      smtpHost: value.smtpHost || "",
      smtpPort: String(value.smtpPort || 587),
      smtpSecure: Boolean(value.smtpSecure),
      smtpStartTls: value.smtpStartTls !== false,
      smtpUsername: value.smtpUsername || "",
      smtpPassword: value.smtpPasswordEncrypted ? MASK : "",
      smtpFrom: value.smtpFrom || "",
      smtpRecipients: (value.smtpRecipients || []).join(", "),
      teamsWebhookUrl: value.teamsWebhookUrlEncrypted ? MASK : "",
      slackWebhookUrl: value.slackWebhookUrlEncrypted ? MASK : "",
      genericWebhookUrl: value.genericWebhookUrlEncrypted ? MASK : "",
      genericWebhookSecret: value.genericWebhookSecretEncrypted ? MASK : "",
      configured: {
        graph: Boolean(value.graphTenantId && value.graphClientId && value.graphSender && value.graphCertificatePemEncrypted && value.graphPrivateKeyPemEncrypted),
        email: Boolean(
          value.smtpHost && value.smtpFrom && value.smtpRecipients?.length,
        ),
        teams: Boolean(value.teamsWebhookUrlEncrypted),
        slack: Boolean(value.slackWebhookUrlEncrypted),
        webhook: Boolean(value.genericWebhookUrlEncrypted),
      },
    };
  }

  async save(input: Record<string, unknown>) {
    const previous = await this.stored();
    const port = Number(input.smtpPort || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new BadRequestException("Invalid SMTP port");
    const recipients = String(input.smtpRecipients || "")
      .split(/[;,]/u)
      .map((v) => v.trim())
      .filter(Boolean);
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
    if (
      recipients.some((v) => !email.test(v)) ||
      (input.smtpFrom && !email.test(String(input.smtpFrom))) ||
      (input.graphSender && !email.test(String(input.graphSender)))
    )
      throw new BadRequestException("Invalid email address");
    const secret = (name: string, prior?: string) => {
      const value = String(input[name] || "").trim();
      return !value || value === MASK ? prior : this.crypto.encrypt(value);
    };
    const value: StoredChannels = {
      graphTenantId: String(input.graphTenantId || "").trim(),
      graphClientId: String(input.graphClientId || "").trim(),
      graphSender: String(input.graphSender || "isms-app@deftagroup.com").trim(),
      graphCertificatePemEncrypted: secret("graphCertificatePem", previous.graphCertificatePemEncrypted),
      graphPrivateKeyPemEncrypted: secret("graphPrivateKeyPem", previous.graphPrivateKeyPemEncrypted),
      smtpHost: String(input.smtpHost || "").trim(),
      smtpPort: port,
      smtpSecure: Boolean(input.smtpSecure),
      smtpStartTls: Boolean(input.smtpStartTls),
      smtpUsername: String(input.smtpUsername || "").trim(),
      smtpPasswordEncrypted: secret(
        "smtpPassword",
        previous.smtpPasswordEncrypted,
      ),
      smtpFrom: String(input.smtpFrom || "").trim(),
      smtpRecipients: recipients,
      teamsWebhookUrlEncrypted: secret(
        "teamsWebhookUrl",
        previous.teamsWebhookUrlEncrypted,
      ),
      slackWebhookUrlEncrypted: secret(
        "slackWebhookUrl",
        previous.slackWebhookUrlEncrypted,
      ),
      genericWebhookUrlEncrypted: secret(
        "genericWebhookUrl",
        previous.genericWebhookUrlEncrypted,
      ),
      genericWebhookSecretEncrypted: secret(
        "genericWebhookSecret",
        previous.genericWebhookSecretEncrypted,
      ),
    };
    await this.prisma.applicationSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: value as never },
      create: { key: SETTING_KEY, value: value as never },
    });
    return this.publicConfiguration();
  }

  private decrypt(value?: string) {
    return value ? this.crypto.decrypt(value) : "";
  }

  private graphThumbprint(config: StoredChannels) {
    if (!config.graphCertificatePemEncrypted) return "";
    try { return new X509Certificate(this.decrypt(config.graphCertificatePemEncrypted)).fingerprint.replace(/:/gu, "").toUpperCase(); } catch { return ""; }
  }

  private async graph(config: StoredChannels, subject: string, text: string, recipients: string[], html?: string) {
    if (!config.graphTenantId || !config.graphClientId || !config.graphSender || !config.graphCertificatePemEncrypted || !config.graphPrivateKeyPemEncrypted) throw new BadRequestException("Microsoft Graph is incomplete");
    if (!recipients.length) throw new BadRequestException("No Graph recipients configured");
    const certificate = new X509Certificate(this.decrypt(config.graphCertificatePemEncrypted));
    const authority = `https://login.microsoftonline.com/${config.graphTenantId}/oauth2/v2.0/token`;
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT", x5t: base64Url(createHash("sha1").update(certificate.raw).digest()) }));
    const payload = base64Url(JSON.stringify({ aud: authority, iss: config.graphClientId, sub: config.graphClientId, jti: randomUUID(), nbf: now - 30, exp: now + 300 }));
    const signer = createSign("RSA-SHA256"); signer.update(`${header}.${payload}`); signer.end();
    const assertion = `${header}.${payload}.${base64Url(signer.sign(this.decrypt(config.graphPrivateKeyPemEncrypted)))}`;
    const tokenResponse = await fetch(authority, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.graphClientId, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion }), signal: AbortSignal.timeout(15000) });
    if (!tokenResponse.ok) throw new Error(`Graph token request returned HTTP ${tokenResponse.status}`);
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("Graph token response is incomplete");
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.graphSender)}/sendMail`, { method: "POST", headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ message: { subject, body: { contentType: "HTML", content: html || notificationHtml(subject, text) }, toRecipients: recipients.map((address) => ({ emailAddress: { address } })) }, saveToSentItems: true }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Graph sendMail returned HTTP ${response.status}`);
  }

  private async safeWebhook(raw: string, channel: AlertChannel) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new BadRequestException("Invalid webhook URL");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new BadRequestException("Webhook URL must use HTTPS");
    if (channel === "teams" && !isAllowedTeamsWebhookHost(url.hostname))
      throw new BadRequestException("Invalid Teams webhook host");
    if (channel === "slack" && url.hostname !== "hooks.slack.com")
      throw new BadRequestException("Invalid Slack webhook host");
    if (isIP(url.hostname) && privateAddress(url.hostname))
      throw new BadRequestException(
        "Private webhook destinations are not allowed",
      );
    const addresses = [
      ...(await resolve4(url.hostname).catch(() => [])),
      ...(await resolve6(url.hostname).catch(() => [])),
    ];
    if (!addresses.length || addresses.some(privateAddress))
      throw new BadRequestException("Unsafe webhook destination");
    return url;
  }

  private smtpReader(socket: Socket | TLSSocket) {
    let buffer = "";
    const waiters: Array<(line: string) => void> = [];
    const lines: string[] = [];
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const waiter = waiters.shift();
        if (waiter) waiter(line);
        else lines.push(line);
      }
    });
    const next = () =>
      lines.length
        ? Promise.resolve(lines.shift() as string)
        : new Promise<string>((resolve) => waiters.push(resolve));
    return async (expected: number) => {
      let line = await next();
      while (/^\d{3}-/u.test(line)) line = await next();
      if (Number(line.slice(0, 3)) !== expected)
        throw new Error(`SMTP rejected command (${line.slice(0, 3)})`);
    };
  }

  private async email(config: StoredChannels, subject: string, text: string) {
    if (!config.smtpHost || !config.smtpFrom || !config.smtpRecipients?.length)
      throw new BadRequestException("SMTP is incomplete");
    const options = { host: config.smtpHost, port: config.smtpPort || 587 };
    let socket: Socket | TLSSocket = config.smtpSecure
      ? connectTls({
          ...options,
          servername: config.smtpHost,
          rejectUnauthorized: true,
        })
      : connectTcp(options);
    let read = this.smtpReader(socket);
    await read(220);
    const command = async (value: string, code: number) => {
      socket.write(`${value}\r\n`);
      await read(code);
    };
    await command(`EHLO ${process.env.HOSTNAME || "isms-portal"}`, 250);
    if (config.smtpStartTls && !config.smtpSecure) {
      await command("STARTTLS", 220);
      socket = connectTls({
        socket,
        servername: config.smtpHost,
        rejectUnauthorized: true,
      });
      read = this.smtpReader(socket);
      await command(`EHLO ${process.env.HOSTNAME || "isms-portal"}`, 250);
    }
    if (config.smtpUsername) {
      await command("AUTH LOGIN", 334);
      await command(Buffer.from(config.smtpUsername).toString("base64"), 334);
      await command(
        Buffer.from(this.decrypt(config.smtpPasswordEncrypted)).toString(
          "base64",
        ),
        235,
      );
    }
    await command(`MAIL FROM:<${config.smtpFrom}>`, 250);
    for (const recipient of config.smtpRecipients)
      await command(`RCPT TO:<${recipient}>`, 250);
    await command("DATA", 354);
    const safeText = Buffer.from(notificationHtml(subject, text)).toString("base64").match(/.{1,76}/gu)!.join("\r\n");
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    socket.write(
      `From: ${config.smtpFrom}\r\nTo: ${config.smtpRecipients.join(", ")}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${safeText}\r\n.\r\n`,
    );
    await read(250);
    await command("QUIT", 221);
    socket.destroy();
  }

  async send(channel: AlertChannel, subject: string, text: string) {
    const config = await this.stored();
    if (channel === "graph") throw new BadRequestException("Graph requires explicitly resolved recipients");
    if (channel === "email") return this.email(config, subject, text);
    const encrypted =
      channel === "teams"
        ? config.teamsWebhookUrlEncrypted
        : channel === "slack"
          ? config.slackWebhookUrlEncrypted
          : config.genericWebhookUrlEncrypted;
    const url = await this.safeWebhook(this.decrypt(encrypted), channel);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (channel === "webhook" && config.genericWebhookSecretEncrypted)
      headers.Authorization = `Bearer ${this.decrypt(config.genericWebhookSecretEncrypted)}`;
    const payload =
      channel === "teams"
        ? {
            type: "message",
            attachments: [
              {
                contentType: "application/vnd.microsoft.card.adaptive",
                contentUrl: null,
                content: {
                  $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                  type: "AdaptiveCard",
                  version: "1.2",
                  body: [
                    {
                      type: "TextBlock",
                      text: subject,
                      weight: "Bolder",
                      size: "Medium",
                      wrap: true,
                    },
                    { type: "TextBlock", text, wrap: true },
                  ],
                },
              },
            ],
          }
        : channel === "webhook"
          ? {
              source: "isms-portal",
              subject,
              message: text,
              occurredAt: new Date().toISOString(),
            }
          : { text: `**${subject}**\n${text}` };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Webhook returned HTTP ${response.status}`);
  }

  async sendGraphTest(recipient: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient)) throw new BadRequestException("Invalid test recipient");
    return this.graph(await this.stored(), "Test Microsoft Graph - ISMS Portal", "Microsoft Graph has accepted this test message from ISMS Portal.", [recipient]);
  }

  async sendPreferredTo(recipients: string[], subject: string, text: string, link = portalLink(), template: EmailTemplate = "service"): Promise<PreferredDelivery> {
    const validRecipients = [...new Set(recipients.map((item) => item.trim().toLowerCase()).filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(item)))];
    if (!validRecipients.length) throw new BadRequestException("No eligible mail recipients");
    const config = await this.stored();
    if (!config.graphTenantId || !config.graphClientId || !config.graphCertificatePemEncrypted || !config.graphPrivateKeyPemEncrypted)
      throw new BadRequestException("Microsoft Graph is not configured");
    await this.graph(config, subject, text, validRecipients, notificationHtml(subject, text, link, template));
    return { delivered: true, channel: "graph", attempted: ["graph"] };
  }

  async sendPreferred(
    subject: string,
    text: string,
  ): Promise<PreferredDelivery> {
    const config = await this.stored();
    const candidates: AlertChannel[] = [];
    if (config.smtpHost && config.smtpFrom && config.smtpRecipients?.length)
      candidates.push("email");
    if (config.teamsWebhookUrlEncrypted) candidates.push("teams");
    if (config.slackWebhookUrlEncrypted) candidates.push("slack");
    if (config.genericWebhookUrlEncrypted) candidates.push("webhook");
    const attempted: AlertChannel[] = [];
    const failures: string[] = [];
    for (const channel of candidates) {
      attempted.push(channel);
      try {
        await this.send(channel, subject, text);
        return { delivered: true, channel, attempted };
      } catch (error) {
        failures.push(
          `${channel}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    if (failures.length) throw new Error(failures.join("; "));
    return { delivered: false, channel: null, attempted };
  }

  async documentAlertPolicy(): Promise<DocumentAlertPolicy> {
    const setting = await this.prisma.applicationSetting.findUnique({
      where: { key: "observability.alert-policy" },
    });
    const policy = (setting?.value || {}) as Record<string, unknown>;
    const requestedDays = Number(policy.documentVersionMaxAgeDays || 365);
    return {
      enabled: Boolean(policy.enabled),
      documentAdded: Boolean(policy.documentAdded),
      documentUpdated: Boolean(policy.documentUpdated),
      documentModified: Boolean(policy.documentModified),
      documentDeleted: Boolean(policy.documentDeleted),
      documentVersionOverdue: Boolean(policy.documentVersionOverdue),
      documentVersionMaxAgeDays: Number.isFinite(requestedDays)
        ? Math.min(3650, Math.max(1, Math.round(requestedDays)))
        : 365,
    };
  }

  async documentEventEnabled(action: string) {
    const preference = {
      "document.upload": "documentAdded",
      "document.version.upload": "documentUpdated",
      "document.metadata.update": "documentModified",
      "document.delete": "documentDeleted",
    }[action] as keyof DocumentAlertPolicy | undefined;
    if (!preference) return true;
    const policy = await this.documentAlertPolicy();
    return policy.enabled && policy[preference] === true;
  }

  async evaluate(result: "success" | "failure" | "denied", graphRecipients?: () => Promise<string[]>) {
    if (result === "success") return;
    const setting = await this.prisma.applicationSetting.findUnique({
      where: { key: "observability.alert-policy" },
    });
    const policy = setting?.value as
      | {
          enabled?: boolean;
          channel?: AlertChannel;
          fiveXxPercent?: string;
          deniedPerMinute?: string;
        }
      | undefined;
    if (!policy?.enabled || !policy.channel) return;
    const since = new Date(Date.now() - 60000);
    const [total, denied, failed] = await Promise.all([
      this.prisma.auditEvent.count({ where: { occurredAt: { gte: since } } }),
      this.prisma.auditEvent.count({
        where: { occurredAt: { gte: since }, result: "denied" },
      }),
      this.prisma.auditEvent.count({
        where: { occurredAt: { gte: since }, result: "failure" },
      }),
    ]);
    const thresholdReached =
      denied >= Number(policy.deniedPerMinute || 20) ||
      (total > 0 &&
        (failed * 100) / total >= Number(policy.fiveXxPercent || 5));
    if (!thresholdReached) return;
    const cooldown = await this.prisma.applicationSetting.findUnique({
      where: { key: "observability.alert-last-sent" },
    });
    const last = Date.parse(
      String((cooldown?.value as { at?: string } | undefined)?.at || ""),
    );
    if (Number.isFinite(last) && Date.now() - last < 15 * 60000) return;
    const subject = "[ISMS Portal] Service alert";
    const message = `${failed} failed requests and ${denied} access denials recorded during the last minute.`;
    if (policy.channel === "graph") await this.sendPreferredTo(await graphRecipients?.() || [], subject, message);
    else await this.send(policy.channel, subject, message);
    const value = { at: new Date().toISOString(), channel: policy.channel };
    await this.prisma.applicationSetting.upsert({
      where: { key: "observability.alert-last-sent" },
      update: { value },
      create: { key: "observability.alert-last-sent", value },
    });
  }
}
