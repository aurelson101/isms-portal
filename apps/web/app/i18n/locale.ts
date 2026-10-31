export const interfaceLocales = ["fr", "en", "es", "sk"] as const;
export type Locale = typeof interfaceLocales[number];
export type DocumentLocale = Locale;
export type LanguageSettings = { enabled: Locale[]; defaultLocale: Locale };
const defaultLanguageSettings: LanguageSettings = { enabled: [...interfaceLocales], defaultLocale: "fr" };
export const normalizeLanguageSettings = (value?: Partial<LanguageSettings> | null): LanguageSettings => {
  const enabled = interfaceLocales.filter(locale => Array.isArray(value?.enabled) && value.enabled.includes(locale));
  return enabled.length ? { enabled, defaultLocale: enabled.includes(value?.defaultLocale as Locale) ? value!.defaultLocale! : enabled[0] } : defaultLanguageSettings;
};
export const resolveEnabledLocale = (preferred: string | null | undefined, settings: LanguageSettings, languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages || []): Locale =>
  settings.enabled.find(locale => locale === preferred) || languages.map(language => language.toLowerCase().split(/[-_]/)[0]).find((locale): locale is Locale => settings.enabled.includes(locale as Locale)) || settings.defaultLocale;

export const isLocale = (value: string | null | undefined): value is Locale =>
  value === "fr" || value === "en" || value === "es" || value === "sk";

export const browserLocale = (languages: readonly string[] = typeof navigator === "undefined" ? ["en"] : navigator.languages?.length ? navigator.languages : [navigator.language]): Locale => {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return "en";
};

export const initialLocale = (
  ...preferences: Array<string | null | undefined>
): Locale => preferences.find(isLocale) || browserLocale();

export const rememberLocale = (locale: Locale) => {
  try { localStorage.setItem("isms-locale", locale); } catch { /* Storage can be disabled by browser policy. */ }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("isms-locale", { detail: locale }));
};

export const readLocale = (): Locale => {
  try { return initialLocale(localStorage.getItem("isms-locale")); }
  catch { return initialLocale(); }
};
