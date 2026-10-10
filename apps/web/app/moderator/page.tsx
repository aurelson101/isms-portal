"use client";

import { translate } from "../i18n/translate";
import { useInterfaceLocale } from "../i18n/use-locale";
import { interfaceLocales, type Locale } from "../i18n/locale";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { responseMessage } from "../request-errors";

import { MetadataForm, VersionForm } from "./document-forms";
import { BatchImport } from "../batch-import";
import { documentPage as parseDocumentPage, latestVersion, translationFields, validateUpload, type Space, type Category, type ModeratorDocument as Document, type MetadataValues } from "./document-model";

type Identity = { isAdmin: boolean; isModerator?: boolean; locale: Locale | null; spaces: Space[] };

const messageOf = (response: Response) => responseMessage(response, "Request failed");

export default function ModeratorPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentPage, setDocumentPage] = useState(1);
  const [documentTotalPages, setDocumentTotalPages] = useState(1);
  const [editing, setEditing] = useState<Document | null>(null);
  const [versionLocale, setVersionLocale] = useState<"fr" | "en">("fr");
  const [metadataEditing, setMetadataEditing] = useState<Document | null>(null);
  const [metadata, setMetadata] = useState<MetadataValues>({ locale: "fr", title: "", description: "", categoryId: "" });
  const [metadataCategories, setMetadataCategories] = useState<Category[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [search, setSearch] = useState("");
  const searchQuery = useRef("");
  const loadRequest = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const mutationInFlight = useRef(false);
  const dirty = useRef(false);
  const importPending = useRef(false);
  const busy = loading || mutationBusy;
  const [locale, changeLocale] = useInterfaceLocale();
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const load = useCallback(async (page = 1) => {
    const request = ++loadRequest.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    setLoading(true);
    try {
    const query = new URLSearchParams({ page: String(page), limit: "20", managed: "true", q: searchQuery.current });
    const [me, list] = await Promise.all([fetch("/api/me", { cache: "no-store", signal: controller.signal }), fetch(`/api/documents?${query}`, { cache: "no-store", signal: controller.signal })]);
    if (request !== loadRequest.current) return;
    if (me.status === 401) { window.location.assign("/login?return=/moderator"); return; }
    if (!me.ok) throw new Error(await messageOf(me));
    const current = await me.json() as Identity;
    if (request !== loadRequest.current) return;
    if (!current.isAdmin && !current.isModerator) { window.location.assign("/"); return; }
    if (!list.ok) throw new Error(await messageOf(list));
    const payload = await list.json();
    if (request !== loadRequest.current) return;
    const result = parseDocumentPage(payload, page);
    setIdentity(current);
    setDocumentPage(result.page);
    setDocuments(result.items);
    setDocumentTotalPages(result.totalPages);
    } catch (reason) {
      if (request === loadRequest.current) throw timedOut ? new Error("Request timed out") : reason;
    } finally {
      window.clearTimeout(timeout);
      if (request === loadRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load().catch((reason) => setError(reason.message));
    return () => { loadRequest.current++; loadController.current?.abort(); };
  }, [load]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  const canDiscard = () => (!dirty.current && !importPending.current) || window.confirm(t("Abandonner les modifications non enregistrées ?", "Discard unsaved changes?"));
  const closeEditor = (force = false) => {
    if (!force && !canDiscard()) return;
    dirty.current = false;
    setEditing(null);
    setMetadataEditing(null);
  };
  const loadPage = (page: number) => { setError(""); void load(page).catch((reason) => setError(reason.message)); };
  const editable = useMemo(() => identity?.spaces.filter((space) => space.permissions.edit || space.permissions.publish || space.permissions.archive) || [], [identity]);
  const spacesById = useMemo(() => new Map(identity?.spaces.map((space) => [space.id, space]) || []), [identity]);
  const rows = useMemo(() => documents.map((document) => ({
    document, latest: latestVersion(document), title: translationFields(document, locale).title,
    permissions: spacesById.get(document.space.id)?.permissions,
  })), [documents, locale, spacesById]);
  const statusLabels: Record<string, string> = {
    DRAFT: t("Brouillon", "Draft"), PUBLISHED: t("Publié", "Published"),
    ARCHIVED: t("Archivé", "Archived"), QUARANTINED: t("En quarantaine", "Quarantined"),
  };
  useEffect(() => {
    if (!editing && !metadataEditing) return;
    const form = window.document.getElementById(editing ? "moderator-version-form" : "moderator-metadata-form");
    form?.querySelector<HTMLElement>("select, input:not([type=hidden])")?.focus({ preventScroll: true });
    form?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }, [editing, metadataEditing]);
  const mutate = async (operation: () => Promise<void>) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setMutationBusy(true);
    setError(""); setNotice("");
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { mutationInFlight.current = false; setMutationBusy(false); }
  };
  const action = async (id: string, name: "publish" | "archive" | "restore" | "delete") => mutate(async () => {
    const endpoint = await fetch(
      name === "delete" ? `/api/documents/${id}` : `/api/documents/${id}/${name}`,
      { method: name === "delete" ? "DELETE" : "POST" },
    );
    if (!endpoint.ok) throw new Error(await messageOf(endpoint));
    if (editing?.id === id || metadataEditing?.id === id) closeEditor(true);
    setNotice(t("Document mis à jour.", "Document updated.")); await load(documentPage);
  });
  const openVersion = (document: Document) => {
    if (!canDiscard()) return;
    dirty.current = false;
    const latest = latestVersion(document);
    setVersionLocale(latest?.locale === "en" ? "en" : "fr");
    setMetadataEditing(null);
    setEditing(document);
  };
  const openMetadata = async (document: Document) => {
    if (!canDiscard()) return;
    await mutate(async () => {
      const response = await fetch(`/api/documents/${document.id}/categories`, { cache: "no-store" });
      if (!response.ok) throw new Error(await messageOf(response));
      const categories: unknown = await response.json();
      if (!Array.isArray(categories)) throw new Error("Invalid category response");
      const selected = latestVersion(document)?.locale === "en" ? "en" : "fr";
      setMetadataCategories(categories as Category[]);
      setMetadata({ locale: selected, ...translationFields(document, selected), categoryId: document.category?.id || "" });
      dirty.current = false;
      setEditing(null);
      setMetadataEditing(document);
    });
  };
  const saveMetadata = async () => {
    if (!metadataEditing) return;
    await mutate(async () => {
      const response = await fetch(`/api/documents/${metadataEditing.id}/metadata`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: metadata.locale, versionId: latestVersion(metadataEditing)?.id,
          title: metadata.title.trim(), description: metadata.description.trim(), categoryId: metadata.categoryId || null }),
      });
      if (!response.ok) throw new Error(await messageOf(response));
      closeEditor(true);
      setNotice(t("Métadonnées enregistrées.", "Metadata saved."));
      await load(documentPage);
    });
  };
  const uploadVersion = async (data: FormData) => mutate(async () => {
    const response = await fetch("/api/documents/upload", { method: "POST", body: validateUpload(data, locale) });
    if (!response.ok) throw new Error(await messageOf(response));
    closeEditor(true);
    setNotice(t("Nouvelle version déposée et analysée.", "New version uploaded and scanned."));
    await load(documentPage);
  });
  if (!identity) return <main className="admin-main"><p role="status">{t("Chargement de l’espace modérateur…", "Loading moderator workspace…")}</p>{error && <><p className="error-state" role="alert">{error}</p><button type="button" disabled={loading} onClick={() => loadPage(documentPage)}>{t("Réessayer", "Retry")}</button></>}</main>;
  return <main className="admin-main moderator-workspace">
    <header className="admin-page-heading"><div><p className="eyebrow">ISMS Portal</p><h1>{t("Espace modérateur", "Moderator workspace")}</h1><p>{t("Gestion documentaire limitée à vos droits effectifs.", "Document management limited to your effective permissions.")}</p></div><div className="login-language" aria-label={t("Langue", "Language")}>{interfaceLocales.map(value => <button type="button" key={value} onClick={() => changeLocale(value)} aria-pressed={locale === value}>{value.toUpperCase()}</button>)}</div><a className="button" href="/explorer" onClick={(event) => { if (!canDiscard()) event.preventDefault(); else dirty.current = false; }}>{t("Retour au portail", "Back to portal")}</a></header>
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error-state" role="alert">{error}</p>}
    <section className="admin-card"><h2>{t("Mes droits documentaires", "My document permissions")}</h2><div className="admin-account-list">{editable.map((space) => <div key={space.id}><span><strong>{locale === "fr" ? space.nameFr : space.nameEn}</strong><small>{[space.permissions.edit && t("modifier", "edit"), space.permissions.publish && t("publier", "publish"), space.permissions.archive && t("archiver / supprimer", "archive / delete")].filter(Boolean).join(" · ")}</small></span></div>)}{!editable.length && <p className="admin-empty compact">{t("Aucun droit de gestion documentaire n’est attribué.", "No document management right is assigned.")}</p>}</div></section>
    {metadataEditing && <MetadataForm document={metadataEditing} categories={metadataCategories} value={metadata} onChange={setMetadata} onSave={saveMetadata} busy={busy} locale={locale} onCancel={() => closeEditor()} onDirty={() => { dirty.current = true; }} />}
    {editing && <VersionForm document={editing} versionLocale={versionLocale} onLocaleChange={setVersionLocale} onUpload={uploadVersion} busy={busy} locale={locale} onCancel={() => closeEditor()} onDirty={() => { dirty.current = true; }} />}
    <BatchImport locale={locale} disabled={busy || Boolean(editing || metadataEditing)} onComplete={() => load(documentPage)} onBusyChange={setMutationBusy} onPendingChange={(pending) => { importPending.current = pending; }} />
    <section className="admin-card">
      <div className="moderator-toolbar"><h2>{t("Documents gérés", "Managed documents")}</h2><button type="button" disabled={busy} onClick={() => loadPage(documentPage)}><Icon name="sync" />{t("Actualiser", "Refresh")}</button></div>
      <form className="moderator-search" role="search" onSubmit={(event) => { event.preventDefault(); searchQuery.current = search.trim(); loadPage(1); }}><label>{t("Rechercher un document", "Search documents")}<input type="search" maxLength={200} value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label><button type="submit" disabled={busy}><Icon name="search" />{t("Rechercher", "Search")}</button>{searchQuery.current && <button type="button" disabled={busy} onClick={() => { setSearch(""); searchQuery.current = ""; loadPage(1); }}>{t("Réinitialiser", "Reset")}</button>}</form>
      <div className="admin-table-wrap"><table aria-busy={loading}><thead><tr><th>{t("Titre", "Title")}</th><th>{t("Espace", "Space")}</th><th>{t("Catégorie", "Category")}</th><th>{t("Version", "Version")}</th><th>{t("État", "Status")}</th><th>{t("Actions", "Actions")}</th></tr></thead><tbody>
        {loading && <tr><td colSpan={6} role="status">{t("Chargement…", "Loading…")}</td></tr>}
        {!loading && !documents.length && <tr><td colSpan={6}>{t("Aucun document géré sur cette page.", "No managed document on this page.")}</td></tr>}
        {!loading && rows.map(({ document, latest, title, permissions }) => {
          const canEdit = !!permissions?.edit;
          const canPublish = !!permissions?.publish;
          const canArchive = !!permissions?.archive;
          return <tr key={document.id}>
            <td data-label={t("Titre", "Title")}>{title}</td>
            <td data-label={t("Espace", "Space")}>{locale === "fr" ? document.space.nameFr : document.space.nameEn}</td>
            <td data-label={t("Catégorie", "Category")}>{document.category ? locale === "fr" ? document.category.nameFr : document.category.nameEn : t("Sans catégorie", "No category")}</td>
            <td data-label={t("Version", "Version")}>{latest ? `v${latest.version}` : "-"}</td>
            <td data-label={t("État", "Status")}>{statusLabels[document.status] || document.status}</td>
            <td data-label={t("Actions", "Actions")}><div className="document-actions">
              {canEdit && <button className="document-action" type="button" disabled={busy} onClick={() => void openMetadata(document)}><Icon name="documents" />{t("Éditer", "Edit")}</button>}
              {canEdit && <button className="document-action" type="button" disabled={busy} onClick={() => openVersion(document)}><Icon name="upload" />{t("Nouvelle version", "New version")}</button>}
              {canPublish && document.status !== "PUBLISHED" && <button className="document-action publish" type="button" disabled={busy} onClick={() => void action(document.id, "publish")}><Icon name="publish" />{t("Publier", "Publish")}</button>}
              {canArchive && document.status !== "ARCHIVED" && <button className="document-action archive" type="button" disabled={busy} onClick={() => void action(document.id, "archive")}><Icon name="archive" />{t("Archiver", "Archive")}</button>}
              {canArchive && document.status === "ARCHIVED" && <button className="document-action" type="button" disabled={busy} onClick={() => void action(document.id, "restore")}><Icon name="restore" />{t("Restaurer", "Restore")}</button>}
              {canArchive && <button className="document-action delete" type="button" disabled={busy} onClick={() => { if (window.confirm(t("Supprimer ce document ?", "Delete this document?"))) void action(document.id, "delete"); }}><Icon name="delete" />{t("Supprimer", "Delete")}</button>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
      {documentTotalPages > 1 && <nav className="document-pagination" aria-label={t("Pagination des documents", "Document pagination")}><button type="button" disabled={busy || documentPage <= 1} onClick={() => loadPage(documentPage - 1)}>← {t("Précédent", "Previous")}</button><span aria-live="polite">{t("Page", "Page")} {documentPage} {t("sur", "of")} {documentTotalPages}</span><button type="button" disabled={busy || documentPage >= documentTotalPages} onClick={() => loadPage(documentPage + 1)}>{t("Suivant", "Next")} →</button></nav>}
    </section>
  </main>;
}
