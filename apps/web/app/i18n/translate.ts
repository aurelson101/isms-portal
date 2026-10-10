import type { Locale } from "./locale";
import { spanishMessages } from "./spanish-messages";
import { additionalSpanishMessages } from "./additional-messages";
import { spanishTemplates } from "./spanish-templates";
import { slovakMessages } from "./slovak-messages";

const compilePatterns = (templates: Readonly<Record<string, string>>) => Object.entries(templates).map(([english, translated]) => ({
  expression: new RegExp("^" + english.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("([\\s\\S]*?)") + "$"),
  translated,
}));

const catalogs = { es: { ...spanishMessages, ...additionalSpanishMessages }, sk: slovakMessages };
const patterns = { es: compilePatterns(spanishTemplates), sk: compilePatterns(Object.fromEntries(Object.entries(slovakMessages).filter(([key]) => /\{\d+\}/.test(key)))) };
const localizedText = (locale: "es" | "sk", text: string) => Object.hasOwn(catalogs[locale], text) ? catalogs[locale][text] : text;

export function translate(locale: Locale, french: string, english: string): string {
  if (locale === "fr") return french;
  if (locale === "en") return english;
  const localized = localizedText(locale, english);
  if (localized !== english) return localized;
  if (english.length <= 10000) for (const pattern of patterns[locale]) {
    const match = pattern.expression.exec(english);
    if (match) return pattern.translated.replace(/\{(\d+)\}/g, (_, index: string) => localizedText(locale, match[Number(index) + 1]));
  }
  return english;
}

export const localizedPair = (locale: Locale, pair: readonly [string, string]) =>
  translate(locale, pair[0], pair[1]);

export function localizeRecord<T extends Record<string, string>>(locale: Locale, values: T): T {
  return Object.fromEntries(Object.entries(values).map(([key, text]) => [key, translate(locale, text, text)])) as T;
}

export function withLocales<T extends { fr: Record<string, string>; en: Record<string, string> }>(catalog: T) {
  const localize = (locale: "es" | "sk") => Object.fromEntries(Object.entries(catalog.en).map(([key, text]) => [key, translate(locale, text, text)])) as { [K in keyof T["en"]]: string };
  return { ...catalog, es: localize("es"), sk: localize("sk") };
}
