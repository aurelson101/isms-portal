import type { Locale } from "./locale";
import { spanishMessages } from "./spanish-messages";
import { additionalSpanishMessages } from "./additional-messages";
import { spanishTemplates } from "./spanish-templates";

const patterns = Object.entries(spanishTemplates).map(([english, spanish]) => ({
  expression: new RegExp("^" + english.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("([\\s\\S]*?)") + "$"),
  spanish,
}));

const spanishText = (text: string) => Object.hasOwn(additionalSpanishMessages, text)
  ? additionalSpanishMessages[text]
  : Object.hasOwn(spanishMessages, text) ? spanishMessages[text] : text;

export function translate(locale: Locale, french: string, english: string): string {
  if (locale === "fr") return french;
  if (locale === "en") return english;
  const localized = spanishText(english);
  if (localized !== english) return localized;
  if (english.length <= 10000) for (const pattern of patterns) {
    const match = pattern.expression.exec(english);
    if (match) return pattern.spanish.replace(/\{(\d+)\}/g, (_, index: string) => spanishText(match[Number(index) + 1]));
  }
  return english;
}

export const localizedPair = (locale: Locale, pair: readonly [string, string]) =>
  translate(locale, pair[0], pair[1]);

export function localizeRecord<T extends Record<string, string>>(locale: Locale, values: T): T {
  return Object.fromEntries(Object.entries(values).map(([key, text]) => [key, translate(locale, text, text)])) as T;
}

export function withSpanish<T extends { fr: Record<string, string>; en: Record<string, string> }>(catalog: T) {
  const es = Object.fromEntries(Object.entries(catalog.en).map(([key, text]) => [key, translate("es", text, text)])) as { [K in keyof T["en"]]: string };
  return { ...catalog, es };
}
