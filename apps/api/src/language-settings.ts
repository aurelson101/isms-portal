import { BadRequestException } from "@nestjs/common";

export const supportedLanguages = ["fr", "en", "es", "sk"] as const;
type Language = (typeof supportedLanguages)[number];
export type LanguageSettings = { enabled: Language[]; defaultLocale: Language };
const defaultLanguageSettings: LanguageSettings = {
  enabled: [...supportedLanguages],
  defaultLocale: "fr",
};

export function validateLanguageSettings(value: unknown): LanguageSettings {
  const data = value as Partial<LanguageSettings> | null;
  if (
    !data ||
    !Array.isArray(data.enabled) ||
    !data.enabled.length ||
    data.enabled.length > supportedLanguages.length ||
    data.enabled.some((locale) => !supportedLanguages.includes(locale)) ||
    new Set(data.enabled).size !== data.enabled.length ||
    !data.defaultLocale ||
    !data.enabled.includes(data.defaultLocale)
  ) {
    throw new BadRequestException(
      "Select at least one supported language and an enabled default language",
    );
  }
  return {
    enabled: supportedLanguages.filter((locale) =>
      data.enabled!.includes(locale),
    ),
    defaultLocale: data.defaultLocale,
  };
}

export function readLanguageSettings(value: unknown): LanguageSettings {
  try {
    return validateLanguageSettings(value);
  } catch {
    return { ...defaultLanguageSettings, enabled: [...supportedLanguages] };
  }
}
