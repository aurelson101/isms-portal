import { afterEach, expect, it, vi } from "vitest";
import { browserLocale, readLocale, rememberLocale } from "./locale";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["fr-CA", "fr"],
  ["en-GB", "en"],
  ["es-MX", "es"],
  ["sk-SK", "sk"],
])("detects %s when storage is blocked", (language, expected) => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("Blocked");
    },
  });
  vi.stubGlobal("navigator", { languages: [language, "en-US"] });
  expect(readLocale()).toBe(expected);
});
it("keeps an explicit language ahead of the browser preference", () => {
  vi.stubGlobal("localStorage", { getItem: () => "fr" });
  vi.stubGlobal("navigator", { languages: ["es-ES"] });
  expect(readLocale()).toBe("fr");
});
it("ignores invalid stored preferences", () => {
  vi.stubGlobal("localStorage", { getItem: () => "invalid" });
  vi.stubGlobal("navigator", { languages: ["de-DE", "sk-SK"] });
  expect(readLocale()).toBe("sk");
});
it("preserves browser language priority and falls back to English", () => {
  expect(browserLocale(["en-US", "es-ES"])).toBe("en");
  expect(browserLocale(["ES_mx", "en-US"])).toBe("es");
  expect(browserLocale(["de-DE"])).toBe("en");
  expect(browserLocale([])).toBe("en");
});
it("reads the browser locale when storage is blocked", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("Blocked");
    },
  });
  vi.stubGlobal("navigator", { language: "en-GB" });
  expect(readLocale()).toBe("en");
});
it("updates document language and dispatches changes when persistence is blocked", () => {
  vi.stubGlobal("localStorage", {
    setItem() {
      throw new Error("Blocked");
    },
  });
  const document = { documentElement: { lang: "fr" } };
  const dispatchEvent = vi.fn();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { dispatchEvent });
  vi.stubGlobal(
    "CustomEvent",
    class {
      constructor(
        public type: string,
        public init: unknown,
      ) {}
    },
  );
  rememberLocale("en");
  expect(document.documentElement.lang).toBe("en");
  expect(dispatchEvent).toHaveBeenCalledOnce();
});
