"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { responseMessage } from "./request-errors";
import type { Locale } from "./i18n/locale";
import { translate } from "./i18n/translate";
import { SensitiveShare } from "./sensitive-share";

type Document = {
  id: string;
  slug: string;
  status: string;
  translations: Array<{ locale: string; title: string }>;
};
export function SensitiveDocumentManager({ locale }: { locale: Locale }) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [items, setItems] = useState<Document[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      managed: "true",
      sensitive: "true",
      page: String(page),
      limit: "20",
      q: search,
    });
    void fetch(`/api/documents?${parameters}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await responseMessage(response, "Request failed"));
        return response.json();
      })
      .then((data: { items: Document[]; totalPages: number }) => {
        setItems(data.items);
        setPages(Math.max(1, data.totalPages));
        setSelected("");
        setError("");
      })
      .catch((failure: Error) => {
        if (failure.name !== "AbortError") setError(failure.message);
      });
    return () => controller.abort();
  }, [page, search]);
  const document = items.find((item) => item.id === selected);
  const title = (item: Document) =>
    (
      item.translations.find((entry) => entry.locale === locale) ||
      item.translations[0]
    )?.title || item.slug;
  return (
    <section className="admin-card sensitive-document-manager">
      <h2>{t("Gérer un document sensible", "Manage a sensitive document")}</h2>
      <p>
        {t(
          "Choisissez un document pour le consulter et gérer ses destinataires nommés. Les droits de lecture de l’espace ne suffisent pas.",
          "Choose a document to view it and manage named recipients. Space read permissions alone do not grant access.",
        )}
      </p>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(query);
          setPage(1);
        }}
      >
        <label>
          {t("Rechercher un document", "Search documents")}
          <input
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button>{t("Rechercher", "Search")}</button>
      </form>
      <label>
        {t("Document", "Document")}
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">{t("Sélectionner…", "Select…")}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {title(item)} — {item.status}
            </option>
          ))}
        </select>
      </label>
      {!items.length && !error && (
        <p>
          {t(
            "Aucun document sensible dans cette vue. Déposez un fichier ou créez un lien en cochant Document sensible.",
            "No sensitive document in this view. Upload a file or create a link with Sensitive document selected.",
          )}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t("Précédent", "Previous")}
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => setPage((value) => value + 1)}
        >
          {t("Suivant", "Next")}
        </button>
      </div>
      {document && (
        <div key={document.id}>
          <h3>{title(document)}</h3>
          <a
            className="primary-link"
            href={`/documents/${encodeURIComponent(document.slug)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Ouvrir le document", "Open document")}
          </a>
          {document.status === "PUBLISHED" ? (
            <SensitiveShare
              documentId={document.id}
              locale={locale}
              showUnavailable
            />
          ) : (
            <p>
              {t(
                "Publiez le document depuis Documents avant de créer un partage nominatif.",
                "Publish the document from Documents before creating a named share.",
              )}
            </p>
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
