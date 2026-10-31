import { afterEach, describe, expect, it, vi } from "vitest";
import { loginRequest } from "./login-shared";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loginRequest", () => {
  it("aborts a stalled connection after 30 seconds", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Aborted")), {
            once: true,
          });
        });
      }),
    );
    const request = loginRequest("/api/auth/directory-login", {});
    await vi.advanceTimersByTimeAsync(29999);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await request).toBeNull();
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 401, 429, 503])(
    "preserves HTTP status %s and clears its timer",
    async (status) => {
      vi.useFakeTimers();
      const response = new Response(null, { status });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect(await loginRequest("/api/auth/login", {})).toBe(response);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("handles network failures and clears its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    expect(await loginRequest("/api/auth/login", {})).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
