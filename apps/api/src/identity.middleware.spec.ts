import { UnauthorizedException } from "@nestjs/common";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityMiddleware } from "./identity.middleware";
import type { IsmsRequest } from "./types";

const response = () => ({ setHeader: vi.fn() });

describe("IdentityMiddleware", () => {
  const auth = {
    enrichSsoIdentity: vi.fn(async (identity) => identity),
    adminSessionIdentity: vi.fn(async () => null),
    sessionIdentity: vi.fn(async () => null),
  };
  const middleware = new IdentityMiddleware(auth as never);
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "production",
      TRUSTED_PROXY_CIDRS: "172.16.0.0/12",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("keeps liveness probes public in production", async () => {
    const req = {
      path: "/health/live",
      originalUrl: "/health/live",
      headers: {},
    } as IsmsRequest;
    const next = vi.fn();
    await middleware.use(req, response() as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.identity.username).toBe("system");
  });

  it("rejects missing production identity", async () => {
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {},
    } as IsmsRequest;
    await expect(
      middleware.use(req, response() as never, vi.fn()),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("accepts a valid local administrator session", async () => {
    auth.sessionIdentity.mockResolvedValueOnce({
      username: "admin",
      displayName: "Administrator",
      groups: ["ISMS-LOCAL-ADMINS"],
      source: "local-admin",
      sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const req = {
      path: "/me",
      originalUrl: "/me",
      headers: {},
    } as IsmsRequest;
    const next = vi.fn();
    await middleware.use(req, response() as never, next);
    expect(req.identity.source).toBe("local-admin");
    expect(next).toHaveBeenCalledOnce();
  });

  it("prioritizes a local administrator cookie over SSO on admin routes", async () => {
    auth.adminSessionIdentity.mockResolvedValueOnce({
      username: "admin",
      displayName: "Administrator",
      groups: ["ISMS-LOCAL-ADMINS"],
      source: "local-admin",
      sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const req = {
      path: "/admin/access-rules",
      originalUrl: "/admin/access-rules",
      headers: {
        "x-auth-mail": "user@example.com",
        "x-auth-groups": "Domain Users",
      },
      socket: { remoteAddress: "172.20.0.5" },
    } as unknown as IsmsRequest;
    const next = vi.fn();
    await middleware.use(req, response() as never, next);
    expect(req.identity.source).toBe("local-admin");
    expect(req.identity.username).toBe("admin");
    expect(next).toHaveBeenCalledOnce();
  });

  it("normalizes trusted proxy identity values", async () => {
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {
        "x-auth-mail": " Alice@Example.com ",
        "x-auth-name": " Alice Example ",
        "x-auth-groups": " Domain Users ; ITAD ;",
      },
      socket: { remoteAddress: "172.20.0.5" },
    } as unknown as IsmsRequest;
    const next = vi.fn();
    await middleware.use(req, response() as never, next);
    expect(req.identity).toEqual({
      username: "alice@example.com",
      displayName: "Alice Example",
      groups: ["Domain Users", "ITAD"],
      source: "trusted-proxy",
      sessionExpiresAt: null,
    });
  });

  it("rejects identity headers coming from an untrusted address", async () => {
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {
        "x-auth-mail": "mallory@example.com",
        "x-auth-groups": "ISMS-ADMINS",
      },
      socket: { remoteAddress: "203.0.113.10" },
    } as unknown as IsmsRequest;
    await expect(
      middleware.use(req, response() as never, vi.fn()),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("accepts a trusted proxy identity independently of the environment", async () => {
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {
        "x-auth-mail": "standard-user@example.com",
        "x-auth-groups": "Domain Users",
      },
      socket: { remoteAddress: "172.20.0.8" },
    } as unknown as IsmsRequest;
    await middleware.use(req, response() as never, vi.fn());
    expect(req.identity).toEqual({
      username: "standard-user@example.com",
      displayName: "standard-user@example.com",
      groups: ["Domain Users"],
      source: "trusted-proxy",
      sessionExpiresAt: null,
    });
  });

  it("accepts a future proxy session expiry", async () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {
        "x-auth-mail": "alice@example.com",
        "x-auth-groups": "Domain Users",
        "x-auth-session-expires": expires,
      },
      socket: { remoteAddress: "172.20.0.9" },
    } as unknown as IsmsRequest;
    await middleware.use(req, response() as never, vi.fn());
    expect(req.identity.sessionExpiresAt).toBe(expires);
  });

  it("rejects an expired proxy session", async () => {
    const req = {
      path: "/documents",
      originalUrl: "/documents",
      headers: {
        "x-auth-mail": "alice@example.com",
        "x-auth-groups": "Domain Users",
        "x-auth-session-expires": "2020-01-01T00:00:00.000Z",
      },
      socket: { remoteAddress: "172.20.0.9" },
    } as unknown as IsmsRequest;
    await expect(
      middleware.use(req, response() as never, vi.fn()),
    ).rejects.toThrow(UnauthorizedException);
  });
});
