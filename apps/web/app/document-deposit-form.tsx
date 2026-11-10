"use client";

import { useState, type FormEvent } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { responseMessage } from "./request-errors";
import type { Locale } from "./i18n/locale";
import { translate } from "./i18n/translate";
import { LanguageSelect } from "./language-controls";
import { StorageSelect } from "./storage-select";
import { prepareBrandLogo } from "./branding";
import { documentFileAccept, validateUpload } from "./moderator/document-model";
import { SensitiveDepositOption } from "./sensitive-controls";
import {
  DocumentSourceChoice,
  ExternalSourceFields,
} from "./document-source-fields";

type Space = {
  id: string;
  nameFr: string;
  nameEn: string;
  categories?: Array<{ id: string; nameFr: string; nameEn: string }>;
};

export function DocumentDepositForm({
  spaces,
  locale,
  onComplete,
}: {
  spaces: Space[];
  locale: Locale;
  onComplete: () => void | Promise<void>;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [spaceId, setSpaceId] = useState("");
  const [external, setExternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = spaces.find((space) => space.id === spaceId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      if (!external) validateUpload(data, locale, { requireSummary: false });
      const image = data.get("thumbnail");
      const response = await fetch(
        external ? "/api/documents/external" : "/api/documents/upload",
        {
          method: "POST",
          ...(external
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  spaceId,
                  categoryId: data.get("categoryId") || undefined,
                  locale: data.get("locale"),
                  title: data.get("title"),
                  description: data.get("description") || undefined,
                  url: data.get("url"),
                  thumbnail:
                    image instanceof File && image.size
                      ? await prepareBrandLogo(image)
                      : null,
                  sensitive: data.get("sensitive") === "true",
                  suppressEmailNotifications:
                    data.get("suppressEmailNotifications") === "true",
                }),
              }
            : { body: data }),
        },
      );
      if (!response.ok)
        throw new Error(await responseMessage(response, "Upload failed"));
      form.reset();
      setExternal(false);
      setMessage(
        t(
          "Document créé en brouillon. Publiez-le depuis les documents gérés.",
          "Document created as a draft. Publish it from managed documents.",
        ),
      );
      await onComplete();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="admin-card admin-form upload-form"
      onSubmit={(event) => void submit(event)}
      aria-busy={busy}
    >
      <h2>{t("Ajouter un document", "Add a document")}</h2>
      <DocumentSourceChoice
        external={external}
        onChange={setExternal}
        locale={locale}
      />
      <label>
        {t("Espace", "Space")}
        <select
          name="spaceId"
          value={spaceId}
          required
          onChange={(event) => setSpaceId(event.target.value)}
        >
          <option value="">{t("Sélectionner…", "Select…")}</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {locale === "fr" ? space.nameFr : space.nameEn}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Catégorie", "Category")}
        <select name="categoryId" key={spaceId}>
          <option value="">{t("Sans catégorie", "No category")}</option>
          {selected?.categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {locale === "fr" ? category.nameFr : category.nameEn}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("Langue du document", "Document language")}
        <LanguageSelect name="locale" defaultValue={locale} required />
      </label>
      <label>
        {t("Titre", "Title")}
        <input name="title" required maxLength={255} />
      </label>
      <label>
        {t("Description", "Description")}
        <textarea name="description" maxLength={2000} />
      </label>
      {external ? (
        <ExternalSourceFields locale={locale} />
      ) : (
        <>
          <label>
            {t("Fichier", "File")}
            <input
              name="file"
              type="file"
              required
              accept={documentFileAccept}
            />
          </label>
          <label>
            {t("Résumé des changements", "Change summary")}
            <textarea name="changeSummary" maxLength={2000} />
          </label>
          <StorageSelect spaceId={spaceId} locale={locale} />
        </>
      )}
      <SensitiveDepositOption locale={locale} external={external} />
      <label className="check">
        <input name="suppressEmailNotifications" type="checkbox" value="true" />
        {t(
          "Ne pas envoyer d’alerte e-mail pour ce dépôt ou sa publication",
          "Do not send email notifications for this upload or publication",
        )}
      </label>
      <div className="button-row">
        <button className="primary" disabled={busy || !spaceId}>
          {external
            ? t("Créer le document lié", "Create linked document")
            : t("Déposer et analyser", "Upload and scan")}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
