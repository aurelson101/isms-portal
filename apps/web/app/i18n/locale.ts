export const interfaceLocales = ["fr", "en", "es"] as const;
export type Locale = typeof interfaceLocales[number];
export type DocumentLocale = "fr" | "en";

export const isLocale = (value: string | null | undefined): value is Locale =>
  value === "fr" || value === "en" || value === "es";

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
