import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeSsoPath, sameOriginMutationGuard } from "./http-security";

const request = (headers: Record<string, string>, method = "POST") =>
  ({
    method,
    get: (name: string) => headers[name.toLowerCase()],
  }) as never;

const response = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { value: { status } as never, status, json };
};

describe("HTTP browser security", () => {
  beforeEach(() => vi.stubEnv("PUBLIC_URL", ""));
  afterEach(() => vi.unstubAllEnvs());
  it("rejects cross-site state changes", () => {
    const target = response();
    const next = vi.fn();
    sameOriginMutationGuard(
      request({ host: "portal.example", "sec-fetch-site": "cross-site" }),
      target.value,
      next,
    );
    expect(target.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts same-origin state changes and non-browser clients", () => {
    for (const headers of [
      { host: "portal.example", origin: "https://portal.example" },
      { host: "portal.example" },
    ]) {
      const next = vi.fn();
      sameOriginMutationGuard(request(headers), response().value, next);
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it("allows reads independently of Origin", () => {
    const next = vi.fn();
    sameOriginMutationGuard(
      request(
        { host: "portal.example", origin: "https://evil.example" },
        "GET",
      ),
      response().value,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    "null",
    "https://portal.example/",
    "https://portal.example/path",
    "https://user:password@portal.example",
    "https://portal.example?query=1",
    "https://portal.example#fragment",
    "ftp://portal.example",
  ])("rejects a non-canonical browser origin: %s", (origin) => {
    const target = response();
    const next = vi.fn();
    sameOriginMutationGuard(
      request({ host: "portal.example", origin }),
      target.value,
      next,
    );
    expect(target.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    "http://portal.example",
    "https://portal.example:8443",
    "https://evil.example",
  ])(
    "rejects an origin outside the configured HTTPS endpoint: %s",
    (origin) => {
      vi.stubEnv("PUBLIC_URL", "https://portal.example");
      const target = response();
      const next = vi.fn();
      sameOriginMutationGuard(
        request({
          host: new URL(origin).host,
          origin,
          "sec-fetch-site": "same-site",
        }),
        target.value,
        next,
      );
      expect(target.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("accepts the public HTTPS origin behind the internal HTTP proxy", () => {
    vi.stubEnv("PUBLIC_URL", "https://portal.example/");
    const next = vi.fn();
    sameOriginMutationGuard(
      request({ host: "portal.example", origin: "https://portal.example" }),
      response().value,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed for an invalid public URL", () => {
    vi.stubEnv("PUBLIC_URL", "invalid");
    const target = response();
    const next = vi.fn();
    sameOriginMutationGuard(
      request({ host: "portal.example", origin: "https://portal.example" }),
      target.value,
      next,
    );
    expect(target.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("exposes only local oauth2-proxy paths", () => {
    expect(safeSsoPath("/oauth2/start?rd=/")).toBe("/oauth2/start?rd=/");
    expect(safeSsoPath("javascript:alert(1)")).toBeNull();
    expect(safeSsoPath("https://evil.example/oauth2/start")).toBeNull();
    expect(safeSsoPath("//evil.example/oauth2/start")).toBeNull();
  });
});
