import { describe, expect, it, vi } from "vitest";
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

  it("exposes only local oauth2-proxy paths", () => {
    expect(safeSsoPath("/oauth2/start?rd=/")).toBe("/oauth2/start?rd=/");
    expect(safeSsoPath("javascript:alert(1)")).toBeNull();
    expect(safeSsoPath("https://evil.example/oauth2/start")).toBeNull();
    expect(safeSsoPath("//evil.example/oauth2/start")).toBeNull();
  });
});
