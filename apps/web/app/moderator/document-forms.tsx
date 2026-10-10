"use client";

import { translate } from "../i18n/translate";

import { useMemo } from "react";
import type { Locale, DocumentLocale } from "../i18n/locale";
import { categoryOptions, translationFields, type Category, type MetadataValues, type ModeratorDocument } from "./document-model";

type FormActions = { busy: boolean; locale: Locale; onCancel: () => void; onDirty: () => void };

export function MetadataForm({ document, categories, value, onChange, onSave, ...actions }: FormActions & {
  document: ModeratorDocument; categories: Category[]; value: MetadataValues;
  onChange: (value: MetadataValues) => void; onSave: () => Promise<void>;
}) {
  const t = (fr: string, en: string) => translate(actions.locale, fr, en);
  const options = useMemo(() => categoryOptions(categories, actions.locale), [categories, actions.locale]);
  return <section className="admin-card" id="moderator-metadata-form">
    <h2>{t("Éditer les métadonnées", "Edit metadata")}</h2>
    <form onChange={actions.onDirty} onSubmit={(event) => { event.preventDefault(); void onSave(); }} aria-busy={actions.busy}>
      <fieldset className="admin-form upload-form moderator-fields" disabled={actions.busy}>
        <label>{t("Langue du document", "Document language")}<select value={value.locale} onChange={(event) => {
          const locale = event.target.value as DocumentLocale;
          onChange({ ...value, locale, ...translationFields(document, locale) });
        }}><option value="fr">FR</option><option value="en">EN</option></select></label>
        <label>{t("Titre", "Title")}<input required maxLength={255} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} /></label>
        <label>{t("Description", "Description")}<textarea maxLength={2000} value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label>
        <label>{t("Catégorie", "Category")}<select value={value.categoryId} onChange={(event) => onChange({ ...value, categoryId: event.target.value })}>
          <option value="">{t("Sans catégorie", "No category")}</option>
          {document.category && !options.some((option) => option.id === document.category!.id) && <option value={document.category.id}>{actions.locale === "fr" ? document.category.nameFr : document.category.nameEn}</option>}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <div className="button-row"><button className="primary" disabled={!value.title.trim()}>{t("Enregistrer", "Save")}</button><button type="button" onClick={actions.onCancel}>{t("Annuler", "Cancel")}</button></div>
      </fieldset>
    </form>
  </section>;
}

export function VersionForm({ document, versionLocale, onLocaleChange, onUpload, ...actions }: FormActions & {
  document: ModeratorDocument; versionLocale: DocumentLocale; onLocaleChange: (locale: DocumentLocale) => void;
  onUpload: (data: FormData) => Promise<void>;
}) {
  const t = (fr: string, en: string) => translate(actions.locale, fr, en);
  const title = translationFields(document, versionLocale).title;
  return <section className="admin-card" id="moderator-version-form">
    <h2>{t("Déposer une nouvelle version", "Upload a new version")}</h2>
    <p><strong>{title}</strong> · {t("espace", "space")}: {actions.locale === "fr" ? document.space.nameFr : document.space.nameEn}</p>
    <form onChange={actions.onDirty} onSubmit={(event) => { event.preventDefault(); void onUpload(new FormData(event.currentTarget)); }} aria-busy={actions.busy}>
      <fieldset className="admin-form upload-form moderator-fields" disabled={actions.busy}>
        <input name="documentId" type="hidden" value={document.id} /><input name="spaceId" type="hidden" value={document.space.id} />
        <label>{t("Langue", "Language")}<select name="locale" value={versionLocale} onChange={(event) => onLocaleChange(event.target.value as DocumentLocale)}><option value="fr">FR</option><option value="en">EN</option></select></label>
        <label>{t("Titre", "Title")}<input key={`${document.id}-${versionLocale}`} name="title" required maxLength={255} defaultValue={title} /></label>
        <label className="wide">{t("Résumé des changements", "Change summary")}<textarea name="changeSummary" required maxLength={2000} /></label>
        <label>{t("Fichier", "File")}<input name="file" type="file" required accept=".pdf,.docx,.xlsx" /></label>
        <label className="check"><input name="suppressEmailNotifications" value="true" type="checkbox" />{t("Ne pas envoyer d’e-mail", "Do not send email notifications")}</label>
        <div className="button-row"><button className="primary">{actions.busy ? t("Traitement…", "Processing…") : t("Déposer et analyser", "Upload and scan")}</button><button type="button" onClick={actions.onCancel}>{t("Annuler", "Cancel")}</button></div>
      </fieldset>
    </form>
  </section>;
}
