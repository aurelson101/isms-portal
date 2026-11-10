"use client";

import { useEffect, useState } from "react";
import { prepareBrandLogo } from "./branding";
import { fetchWithTimeout as fetch } from "./http-client";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";
import { ExternalDocumentLink } from "./external-document-link";

// Add, change or remove the external link (and small image) of an existing document.
export function ExternalLinkEditor({
  documentId,
  externalUrl,
  locale,
  onChanged,
}: {
  documentId: string;
  externalUrl?: string | null;
  locale: Locale;
  onChanged: () => void | Promise<void>;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [url, setUrl] = useState(externalUrl || "");
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setUrl(externalUrl || "");
    setImage(undefined);
  }, [externalUrl, documentId]);

  const save = async (body: {
    url: string | null;
    thumbnail?: string | null;
  }) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/external-link`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        throw new Error(
          [data?.message].flat().filter(Boolean).join(" ") ||
            `HTTP ${response.status}`,
        );
      }
      setMessage(
        body.url
          ? t("Enregistré.", "Saved.")
          : t("Lien retiré.", "Link removed."),
      );
      await onChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="external-link-editor">
      <legend>{t("Lien externe", "External link")}</legend>
      <label>
        {t("Lien externe (http ou https)", "External link (http or https)")}
        <input
          type="url"
          maxLength={2000}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        {t("Petite image (facultative)", "Small image (optional)")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            try {
              setImage(file ? await prepareBrandLogo(file) : undefined);
            } catch (error) {
              setImage(undefined);
              setMessage((error as Error).message);
            }
          }}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() =>
            void save({
              url: url.trim(),
              ...(image !== undefined ? { thumbnail: image } : {}),
            })
          }
        >
          {t("Appliquer", "Apply")}
        </button>
        {externalUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ url: null })}
          >
            {t("Retirer le lien", "Remove link")}
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {externalUrl && (
        <div className="document-external-link">
          <ExternalDocumentLink
            url={externalUrl}
            title={t("Aperçu du lien", "Link preview")}
            locale={locale}
          />
        </div>
      )}
    </fieldset>
  );
}
