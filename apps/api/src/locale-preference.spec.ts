import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { validateSync } from "class-validator";
import { LocalePreferenceDto } from "./admin.dto";
import { UserPreferenceDto } from "./user-tools.dto";

describe("interface locale preferences", () => {
  it.each(["fr", "en", "es", "sk"])(
    "accepts %s in admin and user preferences",
    (locale) => {
      expect(
        validateSync(Object.assign(new LocalePreferenceDto(), { locale })),
      ).toEqual([]);
      expect(
        validateSync(
          Object.assign(new UserPreferenceDto(), {
            locale,
            viewMode: "list",
            density: "comfortable",
            textScale: 100,
            highContrast: false,
            reducedMotion: false,
          }),
        ),
      ).toEqual([]);
    },
  );
  it.each(["de", "es-ES", "sk-SK", "", "__proto__"])(
    "rejects unsupported locale %s",
    (locale) => {
      expect(
        validateSync(Object.assign(new LocalePreferenceDto(), { locale })).some(
          (error) => error.property === "locale",
        ),
      ).toBe(true);
      expect(
        validateSync(Object.assign(new UserPreferenceDto(), { locale })).some(
          (error) => error.property === "locale",
        ),
      ).toBe(true);
    },
  );
});
