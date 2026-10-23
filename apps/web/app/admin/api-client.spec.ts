import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../http-client";
import { api } from "./api-client";

vi.mock("../http-client", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("../request-errors", () => ({
  responseMessage: async (response: Response) => `HTTP ${response.status}`,
}));

const fetch = vi.mocked(fetchWithTimeout);
const replace = vi.fn();
const identityUrl = "/api/admin/check";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", {
    location: { origin: "https://portal.example.com", pathname: "/admin", search: "", hash: "#documents", replace },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("admin API session recovery", () => {
  it.each([
    ["active session", 200, '{"isAdmin":true}', false],
    ["expired session", 401, "", true],
    ["revoked access", 403, "", true],
    ["non-admin identity", 200, '{"isAdmin":false}', true],
    ["unavailable server", 503, "", false],
    ["unexpected response", 200, "<html>upstream error</html>", false],
    ["missing identity", 200, "null", false],
    ["incomplete identity", 200, "{}", false],
  ] as const)("handles %s without mistaking infrastructure errors for logout", async (_name, status, body, redirect) => {
    fetch.mockResolvedValueOnce(new Response("", { status: 403 }))
      .mockResolvedValueOnce(new Response(body, { status }));
    await expect(api("/api/admin/documents")).rejects.toThrow("HTTP 403");
    expect(fetch).toHaveBeenNthCalledWith(2, identityUrl, { cache: "no-store" });
    expect(replace).toHaveBeenCalledTimes(redirect ? 1 : 0);
    if (redirect) expect(replace).toHaveBeenCalledWith("/admin/login?return=%2Fadmin%23documents");
  });

  it("does not redirect when the identity request fails on the network", async () => {
    fetch.mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/api/admin/documents")).rejects.toThrow("HTTP 401");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shares only an in-flight check and checks the next failure again", async () => {
    let resolveIdentity!: (response: Response) => void;
    const identity = new Promise<Response>((resolve) => { resolveIdentity = resolve; });
    fetch.mockImplementation((url) => url === identityUrl
      ? identity : Promise.resolve(new Response("", { status: 403 })));
    const failures = Promise.allSettled([
      api("/api/admin/documents"), api("/api/admin/settings"), api("/api/health/details"),
    ]);
    await vi.waitFor(() => expect(fetch.mock.calls.filter(([url]) => url === identityUrl)).toHaveLength(1));
    resolveIdentity(new Response('{"isAdmin":true}'));
    expect((await failures).every((result) => result.status === "rejected")).toBe(true);
    expect(replace).not.toHaveBeenCalled();

    fetch.mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(api("/api/admin/documents")).rejects.toThrow("HTTP 401");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.filter(([url]) => url === identityUrl)).toHaveLength(2);
  });

  it("does not check sessions on success or ordinary request errors", async () => {
    fetch.mockResolvedValueOnce(new Response('{"items":[]}'))
      .mockResolvedValueOnce(new Response("", { status: 400 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(api("/api/admin/documents")).resolves.toEqual({ items: [] });
    await expect(api("/api/admin/documents")).rejects.toThrow("HTTP 400");
    await expect(api("/api/admin/documents")).rejects.toThrow("HTTP 500");
    expect(fetch.mock.calls.some(([url]) => url === identityUrl)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
