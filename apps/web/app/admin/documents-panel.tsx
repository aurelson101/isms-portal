"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ComponentType } from "react";
import type { Locale } from "../i18n/locale";
import { Icon } from "../icons";
import { StorageSelect } from "../storage-select";
import { BatchImport } from "../batch-import";
import { translationFields, latestVersion, validateUpload } from "../moderator/document-model";
import { api } from "./api-client";
import { flattenCategories, paginationItems, type AdminDocument, type Space } from "./document-model";

export function DocumentsPanel({
  locale, t, confirmAction, EmptyState, statusLabel,
  spaces,
  search,
  onSearch,
  refreshing,
  onChanged,
  onError,
}: {
  locale: Locale;
  t: (fr: string, en?: string) => string;
  confirmAction: (message: string) => Promise<boolean>;
  EmptyState: ComponentType<{ fr: string; en: string; compact?: boolean }>;
  statusLabel: (value: string) => string;
  spaces: Space[];
  search: string;
  onSearch: (value: string) => void;
  refreshing: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [spaceId, setSpaceId] = useState("");
  const [versionUploadDocument, setVersionUploadDocument] =
    useState<AdminDocument | null>(null);
  const [editingMetadataDocument, setEditingMetadataDocument] = useState<AdminDocument | null>(null);
  const [editedCategoryId, setEditedCategoryId] = useState("");
  const [editedLocale, setEditedLocale] = useState<"fr" | "en">("fr");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [savingMetadata, setSavingMetadata] = useState(false);
  const metadataInFlight = useRef(false);
  const [sensitive, setSensitive] = useState(false);
  const [watermarkPosition, setWatermarkPosition] = useState<
    "HEADER" | "CENTER" | "FOOTER"
  >("CENTER");
  const [documentPage, setDocumentPage] = useState(1);
  const [pageDocuments, setPageDocuments] = useState<AdminDocument[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const documentRequest = useRef(0);
  const [documentQuery, setDocumentQuery] = useState(search.trim().slice(0, 200));
  const [documentSort, setDocumentSort] = useState("updatedAt");
  useEffect(() => {
    const query = search.trim().slice(0, 200);
    if (query === documentQuery) return;
    const timer = window.setTimeout(() => { setDocumentPage(1); setDocumentQuery(query); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, documentQuery]);
  const documentPageSize = 20;
  const documentPageCount = Math.max(
    1,
    Math.ceil(documentTotal / documentPageSize),
  );
  const loadDocuments = useCallback(async () => {
    const request = ++documentRequest.current;
    setDocumentsLoading(true);
    setPageDocuments([]);
    try {
      const result = await api<{ items: AdminDocument[]; total: number }>(
        `/api/admin/documents?${new URLSearchParams({ page: String(documentPage), limit: String(documentPageSize), q: documentQuery, sort: documentSort, order: "desc" })}`,
      );
      if (request !== documentRequest.current) return;
      setPageDocuments(result.items);
      setDocumentTotal(result.total);
      setDocumentPage((page) => Math.min(page, Math.max(1, Math.ceil(result.total / documentPageSize))));
    } catch (error) {
      if (request === documentRequest.current) onError((error as Error).message);
    } finally {
      if (request === documentRequest.current) setDocumentsLoading(false);
    }
  }, [documentPage, documentQuery, documentSort, onError]);
  useEffect(() => {
    if (refreshing) return;
    const requests = documentRequest;
    void loadDocuments();
    return () => { requests.current++; };
  }, [loadDocuments, refreshing]);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const versionTranslation = versionUploadDocument?.translations.find(
    (translation) => translation.locale === locale,
  ) ?? versionUploadDocument?.translations[0];
  const nextVersion = versionUploadDocument
    ? Math.max(0, ...versionUploadDocument.versions.map((version) => version.version)) + 1
    : null;
  const selectMetadataLocale = (document: AdminDocument, documentLocale: "fr" | "en") => {
    const fields = translationFields(document, documentLocale);
    setEditedLocale(documentLocale);
    setEditedTitle(fields.title);
    setEditedDescription(fields.description);
  };
  return (
    <>
      <h1>{t("Documents")}</h1>
      <div className="admin-management-tools">
        <label>{t("Rechercher un document", "Search documents")}<input type="search" maxLength={200} value={search} onChange={(event) => onSearch(event.target.value)} /></label>
        <label>{t("Trier par", "Sort by")}<select value={documentSort} onChange={(event) => { setDocumentPage(1); setDocumentSort(event.target.value); }}>
          <option value="updatedAt">{t("Dernière modification", "Last updated")}</option>
          <option value="publishedAt">{t("Publication", "Publication")}</option>
          <option value="status">{t("État")}</option>
        </select></label>
        <span role="status">{documentsLoading ? t("Chargement…") : `${documentTotal} ${t("documents", "documents")}`}</span>
      </div>
      <BatchImport locale={locale} disabled={refreshing} onComplete={async () => { await loadDocuments(); await onChanged(); }} />
      <form
        key={versionUploadDocument?.id || "new-document"}
        id="document-upload-form"
        className="admin-form upload-form"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const data = new FormData(formElement);
          try { validateUpload(data, locale, { requireSummary: false }); }
          catch (error) { onError((error as Error).message); return; }
          await api("/api/admin/documents", { method: "POST", body: data })
            .then(async () => {
              formElement.reset();
              setSpaceId("");
              setVersionUploadDocument(null);
              setSensitive(false);
              setWatermarkPosition("CENTER");
              await onChanged();
            })
            .catch((error) => onError(error.message));
        }}
      >
        <input name="documentId" type="hidden" value={versionUploadDocument?.id || ""} />
        <h2>{versionUploadDocument ? t("Déposer une nouvelle version") : t("Déposer un document", "Upload a document")}</h2>
        {versionUploadDocument && (
          <p className="notice">
            {t("Document sélectionné")}: <strong>{versionTranslation?.title}</strong> · {t("prochaine version")} v{nextVersion}
          </p>
        )}
        <p>
          {t(
            "Formats acceptés : PDF, Word DOCX et Excel XLSX. Les utilisateurs les consultent en lecture seule.",
            "Accepted formats: PDF, Word DOCX and Excel XLSX. Users view them in read-only mode.",
          )}
        </p>
        <label>
          {t("Espace")}
          {versionUploadDocument && <input type="hidden" name="spaceId" value={spaceId} />}
          <select
            name={versionUploadDocument ? undefined : "spaceId"}
            required
            value={spaceId}
            disabled={Boolean(versionUploadDocument)}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            <option value="">{t("Sélectionner…")}</option>
            {spaces.map((space) => (
              <option value={space.id} key={space.id}>
                {locale === "fr" ? space.nameFr : space.nameEn}
              </option>
            ))}
          </select>
        </label>
        {!versionUploadDocument && (
          <label>
            {t("Catégorie")}
            <select name="categoryId">
              <option value="">{t("Sans catégorie")}</option>
              {flattenCategories(selectedSpace?.categories || []).map(
                ({ item, depth }) => (
                  <option value={item.id} key={item.id}>
                    {`${"— ".repeat(depth)}${locale === "fr" ? item.nameFr : item.nameEn}`}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
        <fieldset className="document-language-field">
          <legend>{t("Langue du document")}</legend>
          <div className="document-language-options">
            <label className="document-language-option">
              <input name="locale" type="radio" value="fr" defaultChecked={versionTranslation?.locale !== "en"} />
              <span>FR</span>
            </label>
            <label className="document-language-option">
              <input name="locale" type="radio" value="en" defaultChecked={versionTranslation?.locale === "en"} />
              <span>EN</span>
            </label>
          </div>
          <small>{t("Indique uniquement la langue du fichier.")}</small>
        </fieldset>
        <label>
          {t("Titre")}
          <input name="title" required maxLength={255} defaultValue={versionTranslation?.title || ""} />
        </label>
        <label>
          {t("Description")}
          <textarea name="description" maxLength={2000} defaultValue={versionTranslation?.description || ""} />
        </label>
        <label>
          {t("Résumé des changements")}
          <textarea
            name="changeSummary"
            maxLength={2000}
            placeholder={t("Décrivez ce qui change dans cette version.")}
          />
        </label>
        <label>
          {t("Fichier")}
          <input name="file" type="file" required accept=".pdf,.docx,.xlsx" />
        </label>
        <StorageSelect spaceId={spaceId} locale={locale} admin />
        <label className="check">
          <input name="suppressEmailNotifications" value="true" type="checkbox" /> {t("Ne pas envoyer d’alerte e-mail pour ce dépôt ou sa publication")}
        </label>
        <label className="check">
          <input
            name="sensitive"
            value="true"
            type="checkbox"
            checked={sensitive}
            onChange={(event) => setSensitive(event.target.checked)}
          />{" "}
          {t("Document sensible")}
        </label>
        {sensitive && (
          <section className="watermark-config">
            <label>
              {t("Position du filigrane")}
              <select
                name="watermarkPosition"
                value={watermarkPosition}
                onChange={(event) =>
                  setWatermarkPosition(
                    event.target.value as "HEADER" | "CENTER" | "FOOTER",
                  )
                }
              >
                <option value="HEADER">{t("Haut de page")}</option>
                <option value="CENTER">{t("Milieu de page")}</option>
                <option value="FOOTER">{t("Bas de page")}</option>
              </select>
            </label>
            <div>
              <strong>{t("Aperçu du filigrane")}</strong>
              <div className="watermark-preview" aria-live="polite">
                <span
                  className={`sensitive-watermark ${watermarkPosition.toLowerCase()}`}
                >
                  SENSITIVE DOCUMENT
                </span>
              </div>
            </div>
          </section>
        )}
        <div className="button-row">
          <button className="primary">{versionUploadDocument ? t("Déposer la nouvelle version") : t("Déposer et analyser")}</button>
          {versionUploadDocument && <button type="button" onClick={() => { setVersionUploadDocument(null); setSpaceId(""); setSensitive(false); setWatermarkPosition("CENTER"); }}>{t("Annuler la modification")}</button>}
        </div>
      </form>
      {editingMetadataDocument && (
        <form id="document-metadata-form" className="admin-form upload-form" onSubmit={async (event) => {
          event.preventDefault();
          if (metadataInFlight.current) return;
          metadataInFlight.current = true;
          setSavingMetadata(true);
          try {
            await api(`/api/documents/${editingMetadataDocument.id}/metadata`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale: editedLocale, versionId: latestVersion(editingMetadataDocument)?.id, title: editedTitle.trim(), description: editedDescription.trim(), categoryId: editedCategoryId || null }),
            });
            setEditingMetadataDocument(null);
            await onChanged();
          } catch (error) {
            onError(error instanceof Error ? error.message : String(error));
          } finally {
            metadataInFlight.current = false;
            setSavingMetadata(false);
          }
        }}>
          <h2>{t("Éditer les métadonnées")}</h2>
          <p>{editingMetadataDocument.translations.map((item) => item.title).join(" / ")}</p>
          <label>{t("Langue du document")}
            <select value={editedLocale} onChange={(event) => selectMetadataLocale(editingMetadataDocument, event.target.value as "fr" | "en")}>
              <option value="fr">FR</option><option value="en">EN</option>
            </select>
          </label>
          <label>{t("Titre")}<input required maxLength={255} value={editedTitle} onChange={(event) => setEditedTitle(event.target.value)} /></label>
          <label>{t("Description")}<textarea maxLength={2000} value={editedDescription} onChange={(event) => setEditedDescription(event.target.value)} /></label>
          <label>{t("Catégorie")}
            <select value={editedCategoryId} onChange={(event) => setEditedCategoryId(event.target.value)}>
              <option value="">{t("Sans catégorie")}</option>
              {flattenCategories(spaces.find((space) => space.id === editingMetadataDocument.space.id)?.categories || []).map(({ item, depth }) => (
                <option key={item.id} value={item.id}>{`${"— ".repeat(depth)}${locale === "fr" ? item.nameFr : item.nameEn}`}</option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button className="primary" disabled={savingMetadata || !editedTitle.trim()}>{t("Enregistrer")}</button>
            <button type="button" disabled={savingMetadata} onClick={() => setEditingMetadataDocument(null)}>{t("Annuler")}</button>
          </div>
        </form>
      )}
      <div className="admin-table-wrap">
        <table className="admin-actions-table" aria-busy={documentsLoading}>
          <thead>
            <tr>
              <th>{t("Titre")}</th>
              <th>{t("Espace")}</th>
              <th>{t("Catégorie")}</th>
              <th>{t("Langue du document")}</th>
              <th>{t("État")}</th>
              <th>{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {documentsLoading && <tr><td colSpan={6}><p className="loading-state" role="status">{t("Chargement…")}</p></td></tr>}
            {!documentsLoading && pageDocuments.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    compact
                    fr="Aucun document ne correspond à cette recherche."
                    en="No document matches this search."
                  />
                </td>
              </tr>
            )}
            {pageDocuments.map((document) => (
              <tr key={document.id}>
                <td data-label={t("Titre")}>
                  {document.translations.map((item) => item.title).join(" / ")}
                  <details className="document-lifecycle">
                    <summary>{t("Chronologie")}</summary>
                    <ol>
                      <li>
                        {t("Création")}:{" "}
                        {new Date(document.createdAt).toLocaleString(locale)}
                      </li>
                      {document.versions
                        .slice()
                        .sort((left, right) => left.version - right.version)
                        .map((version) => (
                          <li
                            key={
                              version.id ||
                              `${version.locale}-${version.version}`
                            }
                          >
                            v{version.version} · {version.locale.toUpperCase()}{" "}
                            ·{" "}
                            {new Date(version.createdAt).toLocaleString(locale)}
                          </li>
                        ))}
                      {document.publishedAt && (
                        <li>
                          {t("Publication")}:{" "}
                          {new Date(document.publishedAt).toLocaleString(
                            locale,
                          )}
                        </li>
                      )}
                      <li>
                        {t("Dernière modification")}:{" "}
                        {new Date(document.updatedAt).toLocaleString(locale)}
                      </li>
                    </ol>
                  </details>
                </td>
                <td data-label={t("Espace")}>
                  {locale === "fr"
                    ? document.space.nameFr
                    : document.space.nameEn}
                </td>
                <td data-label={t("Catégorie")}>
                  {document.category ? (locale === "fr" ? document.category.nameFr : document.category.nameEn) : t("Sans catégorie")}
                </td>
                <td data-label={t("Langue du document")}>
                  <div
                    className="document-language-badges"
                    aria-label={t("Langue du document")}
                  >
                    {Array.from(
                      new Set(
                        document.versions.map((version) => version.locale),
                      ),
                    ).map((documentLocale) => (
                      <span
                        className="document-language-badge"
                        key={documentLocale}
                      >
                        {documentLocale.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </td>
                <td data-label={t("État")}>{statusLabel(document.status)}</td>
                <td data-label={t("Actions")}>
                  <div className="document-actions">
                    <button
                      type="button"
                      className="document-action"
                      onClick={() => {
                        setEditingMetadataDocument(document);
                        setEditedCategoryId(document.category?.id || "");
                        selectMetadataLocale(document, latestVersion(document)?.locale === "en" ? "en" : "fr");
                        window.setTimeout(() => window.document.getElementById("document-metadata-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                      }}
                    >
                      <Icon name="documents" />
                      {t("Éditer les métadonnées")}
                    </button>
                    <button
                      type="button"
                      className="document-action"
                      onClick={() => {
                        setVersionUploadDocument(document);
                        setSpaceId(document.space.id);
                        setSensitive(document.sensitive);
                        setWatermarkPosition(document.watermarkPosition);
                        window.setTimeout(() => window.document.getElementById("document-upload-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                      }}
                    >
                      <Icon name="upload" />
                      {t("Nouvelle version")}
                    </button>
                    {document.status !== "PUBLISHED" && (
                      <button
                        className="document-action publish"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/publish`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="publish" />
                        {t("Publier")}
                      </button>
                    )}
                    {document.status !== "ARCHIVED" && (
                      <button
                        className="document-action archive"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/archive`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="archive" />
                        {t("Archiver")}
                      </button>
                    )}
                    {document.status === "ARCHIVED" && (
                      <button
                        className="document-action restore"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/restore`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="restore" />
                        {t("Restaurer")}
                      </button>
                    )}
                    <button
                      className="document-action delete"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            t(
                              "Supprimer définitivement ce document et tous ses fichiers ?",
                            ),
                          ))
                        )
                          return;
                        await api(`/api/admin/documents/${document.id}`, {
                          method: "DELETE",
                        })
                          .then(onChanged)
                          .catch((error) => onError(error.message));
                      }}
                    >
                      <Icon name="delete" />
                      {t("Supprimer")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {documentPageCount > 1 && (
        <nav
          className="document-pagination"
          aria-label={t("Pagination des documents")}
        >
          <button
            type="button"
            disabled={documentsLoading || documentPage <= 1}
            onClick={() => setDocumentPage((page) => page - 1)}
          >
            ← {t("Précédent")}
          </button>
          <div
            className="page-numbers"
            aria-label={`${t("Page")} ${documentPage} ${t("sur")} ${documentPageCount}`}
          >
            {paginationItems(documentPage, documentPageCount).map(
              (item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} aria-hidden="true">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className="page-number"
                    aria-current={item === documentPage ? "page" : undefined}
                    disabled={documentsLoading}
                    onClick={() => setDocumentPage(item)}
                  >
                    {item}
                  </button>
                ),
            )}
          </div>
          <button
            type="button"
            disabled={documentsLoading || documentPage >= documentPageCount}
            onClick={() => setDocumentPage((page) => page + 1)}
          >
            {t("Suivant")} →
          </button>
        </nav>
      )}
    </>
  );
}
