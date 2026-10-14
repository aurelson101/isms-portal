import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, RequestTimeoutError } from "./http-client";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const blocked = () => vi.fn((_input, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
}));
describe("shared browser requests", () => {
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
});
