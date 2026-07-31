import { UnauthorizedException } from "@nestjs/common";
import type { IsmsRequest, Identity } from "./types";

interface IdentityProvider {
  supports(request: IsmsRequest): boolean;
  resolve(request: IsmsRequest): Identity;
}

const ipv4ToNumber = (value: string) => {
  const normalized = value.replace(/^::ffff:/, "");
  const parts = normalized.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return null;
  return parts.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
};

const cidrContains = (cidr: string, address: string) => {
  const [network, prefixValue = "32"] = cidr.trim().split("/");
  const prefix = Number(prefixValue);
  const networkNumber = ipv4ToNumber(network);
  const addressNumber = ipv4ToNumber(address);
  if (
    networkNumber === null ||
    addressNumber === null ||
    prefix < 0 ||
    prefix > 32
  )
    return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (networkNumber & mask) === (addressNumber & mask);
};

export class DemoIdentityProvider implements IdentityProvider {
  supports(_request: IsmsRequest) {
    return (
      process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true"
    );
  }

  resolve() {
    return {
      username: process.env.DEMO_USER || "demo",
      displayName: process.env.DEMO_DISPLAY_NAME || "Demo User",
      source: "demo" as const,
      sessionExpiresAt: null,
      groups: (process.env.DEMO_GROUPS || "Domain Users,ITAD,ISMS-ADMINS")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }
}

export class TrustedProxyIdentityProvider implements IdentityProvider {
  supports(request: IsmsRequest) {
    return (
      typeof request.headers["x-auth-user"] === "string" ||
      typeof request.headers["x-auth-groups"] === "string"
    );
  }

  resolve(request: IsmsRequest) {
    const cidrs = (process.env.TRUSTED_PROXY_CIDRS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const address = request.socket?.remoteAddress || "";
    if (!cidrs.some((cidr) => cidrContains(cidr, address))) {
      throw new UnauthorizedException("Untrusted identity proxy");
    }
    const username = request.headers["x-auth-user"];
    const groups = request.headers["x-auth-groups"];
    const expiresHeader = request.headers["x-auth-session-expires"];
    if (typeof username !== "string" || typeof groups !== "string")
      throw new UnauthorizedException();
    if (!username.trim() || username.length > 255 || groups.length > 8192)
      throw new UnauthorizedException();
    const sessionExpiresAt =
      typeof expiresHeader === "string" && expiresHeader
        ? new Date(expiresHeader)
        : null;
    if (sessionExpiresAt && Number.isNaN(sessionExpiresAt.getTime()))
      throw new UnauthorizedException("Invalid SSO session expiry");
    if (sessionExpiresAt && sessionExpiresAt.getTime() <= Date.now())
      throw new UnauthorizedException("SSO session expired");
    return {
      username: username.trim(),
      displayName: String(request.headers["x-auth-name"] || username).trim(),
      source: "trusted-proxy" as const,
      sessionExpiresAt: sessionExpiresAt?.toISOString() || null,
      groups: groups
        .split(";")
        .map((group) => group.trim())
        .filter(Boolean),
    };
  }
}
