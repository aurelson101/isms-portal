import { afterEach, expect, it, vi } from "vitest";
import { readLocale, rememberLocale } from "./locale";

afterEach(() => vi.unstubAllGlobals());
it("reads the browser locale when storage is blocked", () => {
  vi.stubGlobal("localStorage", { getItem() { throw new Error("Blocked"); } });
  vi.stubGlobal("navigator", { language: "en-GB" });
  expect(readLocale()).toBe("en");
});
it("updates document language and dispatches changes when persistence is blocked", () => {
  vi.stubGlobal("localStorage", { setItem() { throw new Error("Blocked"); } });
  const document = { documentElement: { lang: "fr" } }; const dispatchEvent = vi.fn();
  vi.stubGlobal("document", document); vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal("CustomEvent", class { constructor(public type: string, public init: unknown) {} });
  rememberLocale("en");
  expect(document.documentElement.lang).toBe("en"); expect(dispatchEvent).toHaveBeenCalledOnce();
});
