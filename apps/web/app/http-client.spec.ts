import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, requestTimeout, RequestTimeoutError } from "./http-client";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const blocked = () => vi.fn((_input, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
}));
describe("shared browser requests", () => {
  it.each([undefined, 0, -1, NaN, Infinity, -Infinity])("uses a safe default for invalid timeout %s", value => {
    expect(requestTimeout(value, 15000)).toBe(15000);
  });
  it("caps timers before the browser integer overflow limit", () => {
    expect(requestTimeout(Number.MAX_SAFE_INTEGER, 15000)).toBe(2147483647);
  });
  it("rounds positive timeout values without producing a zero timer", () => {
    expect(requestTimeout(0.2, 15000)).toBe(1);
    expect(requestTimeout(100.8, 15000)).toBe(100);
  });
  it("supports already-aborted signals without throwIfAborted", async () => {
    const controller = new AbortController(); controller.abort();
    Object.defineProperty(controller.signal, "throwIfAborted", { value: undefined });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(fetchWithTimeout("/api/me", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves response objects and credentials", async () => {
    const response = new Response("{}"), fetch = vi.fn().mockResolvedValue(response); vi.stubGlobal("fetch", fetch);
    expect(await fetchWithTimeout("/api/me", { credentials: "same-origin" })).toBe(response);
    expect(fetch).toHaveBeenCalledWith("/api/me", expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
  });
  it.each(["GET", "POST", "PUT", "DELETE"])("times out %s exactly once without retry", async method => {
    vi.useFakeTimers(); const fetch = blocked(); vi.stubGlobal("fetch", fetch);
    const result = fetchWithTimeout("/api/documents", { method }, 100);
    const assertion = expect(result).rejects.toMatchObject({ name: "RequestTimeoutError", uncertain: method !== "GET" });
    await vi.advanceTimersByTimeAsync(100); await assertion;
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates caller cancellation without presenting a timeout", async () => {
    const fetch = blocked(); vi.stubGlobal("fetch", fetch); const controller = new AbortController();
    const result = fetchWithTimeout("/api/documents", { signal: controller.signal }); controller.abort();
    await expect(result).rejects.not.toBeInstanceOf(RequestTimeoutError);
  });
  it("honors the cancellation signal carried by a Request", async () => {
    vi.stubGlobal("fetch", blocked());
    const controller = new AbortController();
    const result = fetchWithTimeout(new Request("https://example.test/api/me", { signal: controller.signal }));
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps caller cancellation connected after headers arrive", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await fetchWithTimeout("/api/me", { signal: controller.signal });
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    const reason = new Error("Navigation cancelled");
    controller.abort(reason);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);
  });
  it("does not start a request that was already cancelled", async () => {
    vi.useFakeTimers();
    const fetch = blocked(); vi.stubGlobal("fetch", fetch);
    const controller = new AbortController(); controller.abort();
    await expect(fetchWithTimeout("/api/me", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not misreport a delayed cancellation rejection as a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => setTimeout(() => reject(init.signal.reason), 200), { once: true });
    })));
    const controller = new AbortController();
    const result = fetchWithTimeout("/api/me", { signal: controller.signal }, 100);
    const reason = new Error("Caller cancellation");
    const assertion = expect(result).rejects.toBe(reason);
    controller.abort(reason);
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
  });
  it("gives multipart Request uploads the same two-minute budget as FormData", async () => {
    vi.useFakeTimers();
    const fetch = blocked(); vi.stubGlobal("fetch", fetch);
    const data = new FormData(); data.set("title", "Policy");
    const result = fetchWithTimeout(new Request("https://example.test/api/documents/upload", { method: "POST", body: data }));
    const assertion = expect(result).rejects.toMatchObject({ name: "RequestTimeoutError", uncertain: true });
    await vi.advanceTimersByTimeAsync(119999);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
  it("allows an explicit signal to replace the Request signal", async () => {
    const original = new AbortController(); original.abort();
    const override = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(fetchWithTimeout(new Request("https://example.test/api/me", { signal: original.signal }), { signal: override.signal })).resolves.toBeInstanceOf(Response);
  });
  it("retains cancellation support in browsers without AbortSignal.any", async () => {
    vi.stubGlobal("AbortSignal", new Proxy(AbortSignal, {
      get: (target, key) => key === "any" ? undefined : Reflect.get(target, key),
    }));
    vi.stubGlobal("fetch", blocked());
    const controller = new AbortController();
    const result = fetchWithTimeout("/api/me", { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
  });
});
