"use client";

import type { ReactNode } from "react";
import type { DocumentLocale } from "./i18n/locale";
import { LanguageSelect } from "./language-controls";

export type MetadataValues = { locale: DocumentLocale; title: string; description: string; categoryId: string };

export function DocumentMetadataFields({ value, onChange, onLocaleChange, t, children, disabled = false }: {
  value: MetadataValues;
  onChange: (value: MetadataValues) => void;
  onLocaleChange: (locale: DocumentLocale) => void;
  t: (fr: string, en: string) => string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return <>
    <label>{t("Langue du document", "Document language")}<LanguageSelect disabled={disabled} value={value.locale} onValueChange={onLocaleChange} preserveCurrent /></label>
    <label>{t("Titre", "Title")}<input disabled={disabled} required maxLength={255} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></label>
    <label>{t("Description", "Description")}<textarea disabled={disabled} maxLength={2000} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label>
    <label>{t("Catégorie", "Category")}<select disabled={disabled} value={value.categoryId} onChange={(event) => onChange({ ...value, categoryId: event.target.value })}>
      <option value="">{t("Sans catégorie", "No category")}</option>
      {children}
    </select></label>
  </>;
}
