export type Locale = "fr" | "en";

export const isLocale = (value: string | null | undefined): value is Locale =>
  value === "fr" || value === "en";

const browserLocale = (language = typeof navigator === "undefined" ? "en" : navigator.language): Locale =>
  language.toLowerCase().startsWith("fr") ? "fr" : "en";

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
