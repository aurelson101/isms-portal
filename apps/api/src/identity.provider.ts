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

const hasControlCharacters = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });

export class TrustedProxyIdentityProvider implements IdentityProvider {
  supports(request: IsmsRequest) {
    return (
      typeof request.headers["x-auth-mail"] === "string" ||
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
    const mail = request.headers["x-auth-mail"];
    const groups = request.headers["x-auth-groups"];
    const expiresHeader = request.headers["x-auth-session-expires"];
    if (typeof mail !== "string") throw new UnauthorizedException();
    if (groups !== undefined && typeof groups !== "string")
      throw new UnauthorizedException();
    const username = mail.trim().toLowerCase();
    const displayName = String(
      request.headers["x-auth-name"] || username,
    ).trim();
    const normalizedGroups = (groups || "")
      .split(/[;,]/u)
      .map((group) => group.trim())
      .filter(Boolean)
      .filter(
        (group, index, values) =>
          values.findIndex(
            (candidate) => candidate.toLowerCase() === group.toLowerCase(),
          ) === index,
      );
    if (
      !username ||
      username.length > 255 ||
      !username.includes("@") ||
      !displayName ||
      displayName.length > 255 ||
      hasControlCharacters(displayName) ||
      (groups?.length || 0) > 8192 ||
      normalizedGroups.length > 512 ||
      normalizedGroups.some(
        (group) => group.length > 255 || hasControlCharacters(group),
      )
    )
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
      username,
      displayName,
      source: "trusted-proxy" as const,
      sessionExpiresAt: sessionExpiresAt?.toISOString() || null,
      groups: normalizedGroups,
    };
  }
}
