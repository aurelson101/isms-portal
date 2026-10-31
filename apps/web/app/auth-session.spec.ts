import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let session: typeof import("./auth-session");
let fetchMock: ReturnType<typeof vi.fn>;
const identity = (username = "alice") => ({
  username,
  isAdmin: false,
  isModerator: false,
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("window", globalThis);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  session = await import("./auth-session");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("portal identity requests", () => {
  it("coalesces concurrent requests and caches a valid identity", async () => {
    fetchMock.mockResolvedValueOnce(response(identity()));
    const first = session.getPortalIdentity();
    const second = session.getPortalIdentity();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(identity());
    await expect(session.getPortalIdentity()).resolves.toEqual(identity());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("coalesces concurrent forced refreshes", async () => {
    fetchMock.mockResolvedValueOnce(response(identity()));
    await Promise.all([
      session.getPortalIdentity({ force: true }),
      session.getPortalIdentity({ force: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("supersedes an ordinary request and never exposes or caches its older response", async () => {
    const old = deferred();
    fetchMock
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(response(identity("new")));
    const original = session.getPortalIdentity();
    const rejected = expect(original).rejects.toMatchObject({
      reason: "unavailable",
    });
    await session.getPortalIdentity({ force: true });
    old.resolve(response(identity("old")));
    await rejected;
    expect(session.getCachedPortalIdentity()).toEqual(identity("new"));
  });
  it("does not let an old completion clear the newer in-flight request", async () => {
    const old = deferred();
    const next = deferred();
    fetchMock
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const original = session.getPortalIdentity();
    const rejected = expect(original).rejects.toMatchObject({
      reason: "unavailable",
    });
    const refresh = session.getPortalIdentity({ force: true });
    old.resolve(response(identity("old")));
    await rejected;
    const joined = session.getPortalIdentity();
    next.resolve(response(identity("new")));
    await expect(joined).resolves.toEqual(identity("new"));
    await refresh;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("invalidates a previous cached identity when a refresh is denied", async () => {
    fetchMock
      .mockResolvedValueOnce(response(identity()))
      .mockResolvedValueOnce(response({}, 403));
    await session.getPortalIdentity();
    await expect(
      session.getPortalIdentity({ force: true }),
    ).rejects.toMatchObject({ reason: "forbidden" });
    expect(session.getCachedPortalIdentity()).toBeNull();
  });
  it("does not start an already-cancelled request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      session.getPortalIdentity({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not invalidate a valid cache for an already-cancelled forced refresh", async () => {
    fetchMock.mockResolvedValueOnce(response(identity()));
    await session.getPortalIdentity();
    const controller = new AbortController();
    controller.abort();
    await expect(
      session.getPortalIdentity({ force: true, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(session.getCachedPortalIdentity()).toEqual(identity());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("allows one caller to cancel without aborting the shared request", async () => {
    const pending = deferred();
    fetchMock.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const first = session.getPortalIdentity({ signal: controller.signal });
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = session.getPortalIdentity();
    controller.abort();
    await rejected;
    pending.resolve(response(identity()));
    await expect(second).resolves.toEqual(identity());
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("expires the cached identity and fetches fresh data", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(response(identity()))
      .mockResolvedValueOnce(response(identity("new")));
    await session.getPortalIdentity();
    vi.advanceTimersByTime(60001);
    expect(session.getCachedPortalIdentity()).toBeNull();
    await expect(session.getPortalIdentity()).resolves.toEqual(identity("new"));
  });
  it.each([
    null,
    [],
    "alice",
    {},
    identity(" "),
    identity("x".repeat(256)),
    { ...identity(), isAdmin: "false" },
    { ...identity(), isModerator: 1 },
  ])("rejects malformed identity data %#", async (value) => {
    fetchMock.mockResolvedValueOnce(response(value));
    await expect(session.getPortalIdentity()).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(session.getCachedPortalIdentity()).toBeNull();
  });
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "unavailable"],
    [503, "unavailable"],
  ])("classifies HTTP %s", async (status, reason) => {
    fetchMock.mockResolvedValueOnce(response({}, status as number));
    await expect(session.getPortalIdentity()).rejects.toMatchObject({ reason });
  });
  it("does not let unsupported browser metrics prevent login", async () => {
    vi.stubGlobal("performance", {
      now: () => 1,
      clearMeasures: () => {},
      measure: () => {
        throw new Error("Unsupported");
      },
    });
    fetchMock.mockResolvedValueOnce(response(identity()));
    await expect(session.getPortalIdentity()).resolves.toEqual(identity());
  });
  it("keeps only the latest identity performance measurement", async () => {
    const clearMeasures = vi.fn();
    vi.stubGlobal("performance", {
      now: () => 1,
      clearMeasures,
      measure: vi.fn(),
    });
    fetchMock
      .mockResolvedValueOnce(response(identity()))
      .mockResolvedValueOnce(response(identity()));
    await session.getPortalIdentity();
    await session.getPortalIdentity({ force: true });
    expect(clearMeasures).toHaveBeenCalledTimes(2);
    expect(clearMeasures).toHaveBeenLastCalledWith("isms.identity-check");
  });
  it("does not cache invalid JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not-json"));
    await expect(session.getPortalIdentity()).rejects.toMatchObject({
      reason: "unavailable",
    });
    expect(session.getCachedPortalIdentity()).toBeNull();
  });
  it("handles network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await expect(session.getPortalIdentity()).rejects.toMatchObject({
      reason: "unavailable",
    });
  });
  it.each([0, -1, NaN, Infinity])(
    "defaults an invalid identity deadline %s",
    async (timeoutMs) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              "abort",
              () => reject(init.signal.reason),
              { once: true },
            );
          }),
      );
      const request = session.getPortalIdentity({ timeoutMs });
      const rejected = expect(request).rejects.toMatchObject({
        reason: "timeout",
      });
      await vi.advanceTimersByTimeAsync(7999);
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("keeps the deadline active while reading the response body", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_url, init) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        }),
    }));
    const rejected = expect(session.getPortalIdentity()).rejects.toMatchObject({
      reason: "timeout",
    });
    await vi.advanceTimersByTimeAsync(8000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
