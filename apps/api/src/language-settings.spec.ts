import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { validateSync } from "class-validator";
import {
  validateLanguageSettings,
  readLanguageSettings,
  supportedLanguages,
} from "./language-settings";
import { DocumentMetadataDto } from "./admin.dto";
import { AdminController } from "./controllers";

describe("portal language configuration", () => {
  it.each(supportedLanguages)(
    "accepts %s as the only enabled default and document language",
    (locale) => {
      expect(
        validateLanguageSettings({ enabled: [locale], defaultLocale: locale }),
      ).toEqual({ enabled: [locale], defaultLocale: locale });
      expect(
        validateSync(
          Object.assign(new DocumentMetadataDto(), { locale, title: "Test" }),
        ),
      ).toEqual([]);
    },
  );
  it.each([
    null,
    {},
    [],
    { enabled: [], defaultLocale: "fr" },
    { enabled: ["de"], defaultLocale: "de" },
    { enabled: ["fr", "fr"], defaultLocale: "fr" },
    { enabled: ["fr"], defaultLocale: "en" },
    { enabled: "fr", defaultLocale: "fr" },
    { enabled: ["__proto__"], defaultLocale: "__proto__" },
  ])("rejects invalid language settings %j", (value) => {
    expect(() => validateLanguageSettings(value)).toThrow();
  });
  it("uses safe defaults for missing or damaged stored settings", () => {
    expect(readLanguageSettings(null)).toEqual({
      enabled: [...supportedLanguages],
      defaultLocale: "fr",
    });
    expect(readLanguageSettings({ enabled: [] }).enabled).toHaveLength(4);
  });
  it("validates the existing administrator settings endpoint before writing", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const record = vi.fn().mockResolvedValue(undefined);
    const controller = new AdminController(
      { applicationSetting: { upsert } } as never,
      {} as never,
      { record } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.updateSetting({} as never, "portal.languages", {
        enabled: [],
        defaultLocale: "fr",
      }),
    ).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
    await controller.updateSetting({} as never, "portal.languages", {
      enabled: ["sk", "fr"],
      defaultLocale: "sk",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: { enabled: ["fr", "sk"], defaultLocale: "sk" } },
      }),
    );
    expect(record).toHaveBeenCalledOnce();
  });
});
