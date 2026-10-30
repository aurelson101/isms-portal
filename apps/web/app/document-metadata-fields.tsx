"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { DocumentLocale } from "./i18n/locale";
import { LanguageSelect } from "./language-controls";

export type MetadataValues = { locale: DocumentLocale; title: string; description: string; categoryId: string; metadata?: Record<string, string> };

const documentTypes = [
  ["policy", "Politique", "Policy"], ["procedure", "Procédure", "Procedure"],
  ["guide", "Guide", "Guide"], ["evidence", "Preuve", "Evidence"], ["record", "Enregistrement", "Record"],
] as const;
const standardFields = [
  { key: "ged.reference", fr: "Référence", en: "Reference", type: "text", aliases: ["Referencia"] },
  { key: "ged.documentType", fr: "Type de document", en: "Document type", type: "select", aliases: ["Tipo de documento", "Typ dokumentu"] },
  { key: "ged.owner", fr: "Responsable", en: "Owner", type: "text", aliases: ["Vlastník"] },
  { key: "ged.keywords", fr: "Mots-clés", en: "Keywords", type: "text", aliases: ["Palabras clave", "Kľúčové slová"] },
  { key: "ged.reviewDate", fr: "Date de revue", en: "Review date", type: "date", aliases: ["Fecha de revisión", "Dátum revízie"] },
] as const;
export function metadataLabel(key: string, t: (fr: string, en: string) => string) {
  const field = standardFields.find(field => field.key === key);
  return field ? t(field.fr, field.en) : key;
}
export function metadataDisplayValue(key: string, value: string, t: (fr: string, en: string) => string, locale = "en") {
  if (key === "ged.reviewDate" && /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value)
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }
  const type = key === "ged.documentType" ? documentTypes.find(type => type[0] === value) : undefined;
  return type ? t(type[1], type[2]) : value;
}

export function CustomMetadataFields({ value, onChange, t, disabled = false }: {
  value: Record<string, string>; onChange: (value: Record<string, string>) => void;
  t: (fr: string, en: string) => string; disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [pendingValue, setPendingValue] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  const suggestionsId = useId();
  const [template, setTemplate] = useState("");
  const entries = Object.entries(value);
  const normalized = (name: string) => name.trim().normalize("NFKC").toLocaleLowerCase();
  const missing = standardFields.filter(field => !entries.some(([key]) => [field.key, field.fr, field.en, ...field.aliases, t(field.fr, field.en)].some(alias => normalized(alias) === normalized(key))));
  const key = name.trim();
  const pendingMessage = t("Cliquez sur Ajouter pour valider le champ, ou effacez les saisies avant d’enregistrer.", "Click Add to confirm the field, or clear the inputs before saving.");
  useEffect(() => { nameInput.current?.setCustomValidity(name.trim() || pendingValue ? pendingMessage : ""); }, [name, pendingValue, pendingMessage]);
  const canAdd = Object.keys(value).length < 20 && /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,63}$/u.test(key)
    && !["__proto__", "constructor", "prototype"].includes(key) && !entries.some(([field]) => normalized(field) === normalized(key));
  const addField = () => { if (canAdd) { onChange({ ...value, [key]: pendingValue }); setName(""); setPendingValue(""); } };
  return <fieldset className="admin-form wide custom-metadata-fields" disabled={disabled}>
    <legend>{t("Champs personnalisés", "Custom fields")}</legend>
    <p>{t("Ajoutez une référence, un responsable ou des mots-clés. Ces champs sont recherchables, y compris dans vos favoris, sans modifier la version du fichier.", "Add a reference, owner or keywords. These fields are searchable, including in your favorites, without changing the file version.")}</p>
    <div className="metadata-template-tools"><label>{t("Modèle de fiche", "Metadata template")}<select value={template} disabled={entries.length + missing.length > 20} onChange={event => {
      const selected = event.target.value;
      setTemplate(selected);
      if (selected) onChange({ ...value, ...Object.fromEntries(missing.map(field => [field.key, field.key === "ged.documentType" ? selected : ""])) });
    }}><option value="">{t("Choisir…", "Select…")}</option>{documentTypes.map(([key, fr, en]) => <option key={key} value={key}>{t(fr, en)}</option>)}</select></label>
      <output aria-live="polite">{entries.filter(([, content]) => content.trim()).length} / {entries.length} {t("champs renseignés", "fields completed")} · {entries.length}/20</output>
    </div>
    <p>{t("Le modèle ajoute uniquement les champs manquants. La date de revue est descriptive ; planifiez les rappels dans Gouvernance.", "The template only adds missing fields. The review date is descriptive; schedule reminders in Governance.")}</p>
    <p>{t("Le modèle s’applique dès sa sélection. Cliquez sur Enregistrer pour conserver les modifications. Les champs vides ne s’affichent pas dans la fiche de lecture.", "The template is applied when selected. Click Save to keep your changes. Empty fields are hidden in the reading view.")}</p>
    {entries.map(([field, content]) => {
      const definition = standardFields.find(item => item.key === field);
      const label = metadataLabel(field, t);
      return <div className="button-row" key={field}>
        <label>{label}{definition?.type === "select" ? <select value={content} onChange={event => onChange({ ...value, [field]: event.target.value })}><option value="">—</option>{documentTypes.map(([key, fr, en]) => <option key={key} value={key}>{t(fr, en)}</option>)}</select>
          : <input type={definition?.type === "date" ? "date" : "text"} min={definition?.type === "date" ? "0001-01-01" : undefined} max={definition?.type === "date" ? "9999-12-31" : undefined} maxLength={1000} value={content} onChange={event => onChange({ ...value, [field]: event.target.value })} />}</label>
        <button type="button" aria-label={`${t("Supprimer", "Delete")} ${label}`} onClick={() => onChange(Object.fromEntries(entries.filter(([item]) => item !== field)))}>{t("Supprimer", "Delete")}</button>
      </div>;
    })}
    <div className="button-row"><label>{t("Nom du champ", "Field name")}<input ref={nameInput} value={name} list={suggestionsId} maxLength={64} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} /></label>
      <label>{t("Valeur du champ", "Field value")}<input value={pendingValue} maxLength={1000} onChange={event => setPendingValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addField(); } }} /></label>
      <button type="button" disabled={!canAdd} onClick={addField}>{t("Ajouter", "Add")}</button></div>
    {(name.trim() || pendingValue) && <p role="status">{pendingMessage}</p>}
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
