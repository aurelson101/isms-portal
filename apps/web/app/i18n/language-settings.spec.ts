import { expect, it } from "vitest";
import { normalizeLanguageSettings, resolveEnabledLocale } from "./locale";

it("keeps an enabled personal language ahead of browser preferences", () => {
  expect(
    resolveEnabledLocale(
      "sk",
      { enabled: ["fr", "en", "sk"], defaultLocale: "fr" },
      ["en-US"],
    ),
  ).toBe("sk");
});
it("uses an enabled browser language when the personal preference is disabled", () => {
  expect(
    resolveEnabledLocale("es", { enabled: ["fr", "en"], defaultLocale: "fr" }, [
      "es-ES",
      "en-US",
    ]),
  ).toBe("en");
});
it("uses the configured default if neither preference nor browser is enabled", () => {
  expect(
    resolveEnabledLocale("es", { enabled: ["fr", "sk"], defaultLocale: "sk" }, [
      "de-DE",
    ]),
  ).toBe("sk");
});
it("never leaves an empty or unsupported client language list", () => {
  expect(normalizeLanguageSettings({ enabled: [] }).enabled).toEqual([
    "fr",
    "en",
    "es",
    "sk",
  ]);
  expect(
    normalizeLanguageSettings({ enabled: ["es", "sk"], defaultLocale: "fr" }),
  ).toEqual({ enabled: ["es", "sk"], defaultLocale: "es" });
  expect(
    normalizeLanguageSettings({ enabled: "fr" } as never).enabled,
  ).toHaveLength(4);
});
