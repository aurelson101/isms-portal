export type Locale = "fr" | "en";

const isLocale = (value: string | null | undefined): value is Locale =>
  value === "fr" || value === "en";

const browserLocale = (language = navigator.language): Locale =>
  language.toLowerCase().startsWith("fr") ? "fr" : "en";

export const initialLocale = (
  ...preferences: Array<string | null | undefined>
): Locale => preferences.find(isLocale) || browserLocale();

export const rememberLocale = (locale: Locale) => {
  localStorage.setItem("isms-locale", locale);
  document.documentElement.lang = locale;
};
