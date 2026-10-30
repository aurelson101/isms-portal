"use client";

import { useId, useState, type ReactNode } from "react";
import type { DocumentLocale } from "./i18n/locale";
import { LanguageSelect } from "./language-controls";

export type MetadataValues = { locale: DocumentLocale; title: string; description: string; categoryId: string; metadata?: Record<string, string> };

export function CustomMetadataFields({ value, onChange, t, disabled = false }: {
  value: Record<string, string>; onChange: (value: Record<string, string>) => void;
  t: (fr: string, en: string) => string; disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const suggestionsId = useId();
  const key = name.trim();
  const canAdd = Object.keys(value).length < 20 && /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u.test(key)
    && !["__proto__", "constructor", "prototype"].includes(key) && !Object.hasOwn(value, key);
  return <fieldset className="admin-form wide custom-metadata-fields" disabled={disabled}>
    <legend>{t("Champs personnalisés", "Custom fields")}</legend>
    <p>{t("Ajoutez une référence, un responsable ou des mots-clés. Ces champs sont recherchables, y compris dans vos favoris, sans modifier la version du fichier.", "Add a reference, owner or keywords. These fields are searchable, including in your favorites, without changing the file version.")}</p>
    {Object.entries(value).map(([field, content]) => <div className="button-row" key={field}>
      <label>{field}<input maxLength={1000} value={content} onChange={event => onChange({ ...value, [field]: event.target.value })} /></label>
      <button type="button" aria-label={`${t("Supprimer", "Delete")} ${field}`} onClick={() => onChange(Object.fromEntries(Object.entries(value).filter(([item]) => item !== field)))}>{t("Supprimer", "Delete")}</button>
    </div>)}
    <div className="button-row"><label>{t("Nom du champ", "Field name")}<input value={name} list={suggestionsId} maxLength={64} onChange={event => setName(event.target.value)} /></label>
      <button type="button" disabled={!canAdd} onClick={() => { onChange({ ...value, [key]: "" }); setName(""); }}>{t("Ajouter", "Add")}</button></div>
    <datalist id={suggestionsId}>{[t("Référence", "Reference"), t("Responsable", "Owner"), t("Mots-clés", "Keywords")].map(label => <option key={label} value={label} />)}</datalist>
  </fieldset>;
}

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
    <CustomMetadataFields value={value.metadata || {}} onChange={metadata => onChange({ ...value, metadata })} t={t} disabled={disabled} />
  </>;
}
