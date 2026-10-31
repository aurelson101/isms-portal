import {
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, createSign, randomUUID, X509Certificate } from "crypto";
import { readFileSync } from "fs";

const graph = "https://graph.microsoft.com/v1.0";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SsoMailboxPolicy {
  private readonly cache = new Map<
    string,
    { allowed: boolean; until: number }
  >();
  private readonly pending = new Map<string, Promise<boolean>>();
  private token: { value: string; until: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  async assertAllowed(username: string) {
    if (process.env.SSO_MAILBOX_POLICY_ENABLED !== "true") return;
    const mail = username.trim().toLowerCase();
    const domains = (process.env.SSO_MAILBOX_ALLOWED_DOMAINS || "")
      .toLowerCase()
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!domains.length)
      throw new ServiceUnavailableException(
        "SSO mailbox policy is not configured",
      );
    if (
      !/^[^\s@'\\]+@[^\s@'\\]+$/.test(mail) ||
      !domains.includes(mail.split("@")[1])
    ) {
      throw new ForbiddenException(
        "A personal mailbox in an authorized domain is required",
      );
    }
    try {
      const cached = this.cache.get(mail);
      let allowed: boolean;
      if (cached && cached.until > Date.now()) {
        allowed = cached.allowed;
      } else {
        let request = this.pending.get(mail);
        if (!request) {
          if (this.pending.size >= 128)
            throw new Error("Mailbox policy is busy");
          request = this.check(mail)
            .then((result) => {
              this.cache.delete(mail);
              while (this.cache.size >= 10000)
                this.cache.delete(this.cache.keys().next().value!);
              this.cache.set(mail, {
                allowed: result,
                until: Date.now() + (result ? 60000 : 15000),
              });
              return result;
            })
            .finally(() => this.pending.delete(mail));
          this.pending.set(mail, request);
        }
        allowed = await request;
      }
      if (!allowed)
        throw new ForbiddenException(
          "An active internal account with a personal mailbox is required",
        );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ServiceUnavailableException(
        "SSO mailbox verification is temporarily unavailable",
      );
    }
  }

  private async check(mail: string) {
    const token = await this.accessToken();
    const query = new URLSearchParams({
      $filter: `mail eq '${mail}'`,
      $select: "id,mail,accountEnabled,userType",
      $top: "2",
    });
    const response = await this.request(`${graph}/users?${query}`, token);
    if (!response.ok) throw new Error("Directory verification failed");
    const users = (await response.json()) as {
      value?: Array<{
        id?: string;
        mail?: string;
        accountEnabled?: boolean;
        userType?: string;
      }>;
      "@odata.nextLink"?: string;
    };
    if (users["@odata.nextLink"] || users.value?.length !== 1) return false;
    const user = users.value[0];
    if (
      !user.id ||
      !uuid.test(user.id) ||
      user.mail?.toLowerCase() !== mail ||
      user.accountEnabled !== true ||
      user.userType !== "Member"
    )
      return false;
    const mailbox = await this.request(
      `${graph}/users/${user.id}/mailboxSettings/userPurpose`,
      token,
    );
    if (mailbox.status === 404) return false;
    if (!mailbox.ok) throw new Error("Mailbox verification failed");
    const purpose = (await mailbox.json()) as { value?: string };
    return purpose.value === "user";
  }

  private async request(url: string, token: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (response.status === 401) this.token = null;
    return response;
  }

  private accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now())
      return Promise.resolve(this.token.value);
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = this.acquireToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async acquireToken() {
    const tenant = process.env.SSO_MAILBOX_TENANT_ID || "";
    const client = process.env.SSO_MAILBOX_CLIENT_ID || "";
    if (!uuid.test(tenant) || !uuid.test(client))
      throw new Error("Invalid mailbox policy credentials");
    const certificate = new X509Certificate(
      readFileSync(process.env.SSO_MAILBOX_CERTIFICATE_FILE || ""),
    );
    if (
      Date.parse(certificate.validFrom) > Date.now() ||
      Date.parse(certificate.validTo) <= Date.now()
    )
      throw new Error("Mailbox certificate is not valid");
    const authority = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const encode = (value: string | Buffer) =>
      Buffer.from(value).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const header = encode(
      JSON.stringify({
        alg: "RS256",
        typ: "JWT",
        x5t: createHash("sha1").update(certificate.raw).digest("base64url"),
      }),
    );
    const payload = encode(
      JSON.stringify({
        aud: authority,
        iss: client,
        sub: client,
        jti: randomUUID(),
        nbf: now - 30,
        exp: now + 300,
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    const assertion = `${header}.${payload}.${encode(signer.sign(readFileSync(process.env.SSO_MAILBOX_PRIVATE_KEY_FILE || "")))}`;
    const response = await fetch(authority, {
      method: "POST",
      body: new URLSearchParams({
        client_id: client,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Mailbox token request failed");
    const token = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (
      typeof token.access_token !== "string" ||
      !token.access_token ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in! < 120
    )
      throw new Error("Invalid mailbox token");
    this.token = {
      value: token.access_token,
      until: Date.now() + Math.min(token.expires_in! - 60, 3600) * 1000,
    };
    return token.access_token;
  }
}
