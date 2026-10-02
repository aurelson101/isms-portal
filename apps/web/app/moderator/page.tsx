"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { responseMessage } from "../request-errors";

type Space = { id: string; nameFr: string; nameEn: string; permissions: Record<string, boolean> };
type Identity = { displayName: string; username: string; isAdmin: boolean; isModerator?: boolean; locale: "fr" | "en" | null; spaces: Space[] };
type Document = { id: string; status: string; space: { id: string; nameFr: string; nameEn: string }; category: { id: string; nameFr: string; nameEn: string } | null; translations: Array<{ locale: string; title: string; description: string | null }>; versions: Array<{ id: string; locale: string; version: number }> };
type Category = { id: string; parentId: string | null; nameFr: string; nameEn: string };
const latestVersion = (document: Document) => document.versions.reduce<Document["versions"][number] | undefined>((latest, version) => !latest || version.version > latest.version ? version : latest, undefined);

const messageOf = (response: Response) => responseMessage(response, "Request failed");

export default function ModeratorPage() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentPage, setDocumentPage] = useState(1);
  const [documentTotalPages, setDocumentTotalPages] = useState(1);
  const [editing, setEditing] = useState<Document | null>(null);
  const [versionLocale, setVersionLocale] = useState<"fr" | "en">("fr");
  const [metadataEditing, setMetadataEditing] = useState<Document | null>(null);
  const [metadataLocale, setMetadataLocale] = useState<"fr" | "en">("fr");
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");
  const [metadataCategoryId, setMetadataCategoryId] = useState("");
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
  const busy = loading || mutationBusy;
  const locale = identity?.locale === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;
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
    setIdentity(current);
    setDocumentPage(Array.isArray(payload) ? page : payload.page || page);
    setDocuments(Array.isArray(payload) ? payload : payload.items || []);
    setDocumentTotalPages(Array.isArray(payload) ? 1 : Math.max(1, payload.totalPages || 1));
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
  const loadPage = (page: number) => { setError(""); void load(page).catch((reason) => setError(reason.message)); };
  const editable = useMemo(() => identity?.spaces.filter((space) => space.permissions.edit || space.permissions.publish || space.permissions.archive) || [], [identity]);
  const spacesById = useMemo(() => new Map(identity?.spaces.map((space) => [space.id, space]) || []), [identity]);
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
    setNotice(t("Document mis à jour.", "Document updated.")); await load(documentPage);
  });
  const openVersion = (document: Document) => {
    const latest = latestVersion(document);
    setVersionLocale(latest?.locale === "en" ? "en" : latest?.locale === "fr" ? "fr" : locale);
    setMetadataEditing(null);
    setEditing(document);
  };
  const selectMetadataLocale = (document: Document, selected: "fr" | "en") => {
    const translation = document.translations.find((item) => item.locale === selected);
    setMetadataLocale(selected);
    setMetadataTitle(translation?.title || document.translations[0]?.title || "");
    setMetadataDescription(translation ? translation.description ?? "" : document.translations[0]?.description ?? "");
  };
  const openMetadata = async (document: Document) => {
    await mutate(async () => {
      const response = await fetch(`/api/documents/${document.id}/categories`, { cache: "no-store" });
      if (!response.ok) throw new Error(await messageOf(response));
      setMetadataCategories(await response.json() as Category[]);
      setMetadataCategoryId(document.category?.id || "");
      selectMetadataLocale(document, latestVersion(document)?.locale === "en" ? "en" : "fr");
      setEditing(null);
      setMetadataEditing(document);
    });
  };
  if (!identity) return <main className="admin-main"><p role="status">{t("Chargement de l’espace modérateur…", "Loading moderator workspace…")}</p>{error && <><p className="error-state" role="alert">{error}</p><button type="button" disabled={loading} onClick={() => loadPage(documentPage)}>{t("Réessayer", "Retry")}</button></>}</main>;
  return <main className="admin-main moderator-workspace">
    <header className="admin-page-heading"><div><p className="eyebrow">ISMS Portal</p><h1>{t("Espace modérateur", "Moderator workspace")}</h1><p>{t("Gestion documentaire limitée à vos droits effectifs.", "Document management limited to your effective permissions.")}</p></div><a className="button" href="/explorer">{t("Retour au portail", "Back to portal")}</a></header>
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error-state" role="alert">{error}</p>}
    <section className="admin-card"><h2>{t("Mes droits documentaires", "My document permissions")}</h2><div className="admin-account-list">{editable.map((space) => <div key={space.id}><span><strong>{locale === "fr" ? space.nameFr : space.nameEn}</strong><small>{[space.permissions.edit && t("modifier", "edit"), space.permissions.publish && t("publier", "publish"), space.permissions.archive && t("archiver / supprimer", "archive / delete")].filter(Boolean).join(" · ")}</small></span></div>)}{!editable.length && <p className="admin-empty compact">{t("Aucun droit de gestion documentaire n’est attribué.", "No document management right is assigned.")}</p>}</div></section>
    {metadataEditing && <section className="admin-card" id="moderator-metadata-form">
      <h2>{t("Éditer les métadonnées", "Edit metadata")}</h2>
      <form onSubmit={async (event) => {
        event.preventDefault();
        await mutate(async () => {
          const response = await fetch(`/api/documents/${metadataEditing.id}/metadata`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: metadataLocale, versionId: latestVersion(metadataEditing)?.id, title: metadataTitle.trim(), description: metadataDescription.trim(), categoryId: metadataCategoryId || null }),
          });
          if (!response.ok) throw new Error(await messageOf(response));
          setMetadataEditing(null); setNotice(t("Métadonnées enregistrées.", "Metadata saved.")); await load(documentPage);
        });
      }} aria-busy={busy}><fieldset className="admin-form upload-form moderator-fields" disabled={busy}>
        <label>{t("Langue du document", "Document language")}<select value={metadataLocale} onChange={(event) => selectMetadataLocale(metadataEditing, event.target.value as "fr" | "en")}><option value="fr">FR</option><option value="en">EN</option></select></label>
        <label>{t("Titre", "Title")}<input required maxLength={255} value={metadataTitle} onChange={(event) => setMetadataTitle(event.target.value)} /></label>
        <label>{t("Description", "Description")}<textarea maxLength={2000} value={metadataDescription} onChange={(event) => setMetadataDescription(event.target.value)} /></label>
        <label>{t("Catégorie", "Category")}<select value={metadataCategoryId} onChange={(event) => setMetadataCategoryId(event.target.value)}><option value="">{t("Sans catégorie", "No category")}</option>{metadataEditing.category && !metadataCategories.some((category) => category.id === metadataEditing.category!.id) && <option value={metadataEditing.category.id}>{locale === "fr" ? metadataEditing.category.nameFr : metadataEditing.category.nameEn}</option>}{metadataCategories.map((category) => <option key={category.id} value={category.id}>{locale === "fr" ? category.nameFr : category.nameEn}</option>)}</select></label>
        <div className="button-row"><button className="primary" disabled={busy || !metadataTitle.trim()}>{t("Enregistrer", "Save")}</button><button type="button" disabled={busy} onClick={() => setMetadataEditing(null)}>{t("Annuler", "Cancel")}</button></div>
      </fieldset></form>
    </section>}
    {editing && <section className="admin-card" id="moderator-version-form"><h2>{t("Déposer une nouvelle version", "Upload a new version")}</h2><p><strong>{editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title}</strong> · {t("espace", "space")}: {locale === "fr" ? editing.space.nameFr : editing.space.nameEn}</p><form onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      await mutate(async () => {
        const file = data.get("file");
        if (!(file instanceof File) || !file.size) throw new Error(t("Le fichier est vide.", "The file is empty."));
        if (!/\.(pdf|docx|xlsx)$/i.test(file.name)) throw new Error(t("Format non autorisé : PDF, DOCX ou XLSX.", "Unsupported format: PDF, DOCX or XLSX required."));
        if (file.size > 50 * 1024 * 1024) throw new Error(t("Le fichier dépasse 50 Mo.", "The file exceeds 50 MB."));
        for (const field of ["title", "changeSummary"]) {
          const value = String(data.get(field) || "").trim();
          if (!value) throw new Error(t("Le titre et le résumé des changements sont obligatoires.", "Title and change summary are required."));
          data.set(field, value);
        }
        const response = await fetch("/api/documents/upload", { method: "POST", body: data });
        if (!response.ok) throw new Error(await messageOf(response));
        setEditing(null);
        setNotice(t("Nouvelle version déposée et analysée.", "New version uploaded and scanned."));
        await load(documentPage);
      });
    }} aria-busy={busy}><fieldset className="admin-form upload-form moderator-fields" disabled={busy}><input name="documentId" type="hidden" value={editing.id} /><input name="spaceId" type="hidden" value={editing.space.id} /><label>{t("Langue", "Language")}<select name="locale" value={versionLocale} onChange={(event) => setVersionLocale(event.target.value as "fr" | "en")}><option value="fr">FR</option><option value="en">EN</option></select></label><label>{t("Titre", "Title")}<input key={`${editing.id}-${versionLocale}`} name="title" required maxLength={255} defaultValue={editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title || ""} /></label><label className="wide">{t("Résumé des changements", "Change summary")}<textarea name="changeSummary" required maxLength={2000} /></label><label>{t("Fichier", "File")}<input name="file" type="file" required accept=".pdf,.docx,.xlsx" /></label><label className="check"><input name="suppressEmailNotifications" value="true" type="checkbox" />{t("Ne pas envoyer d’e-mail", "Do not send email notifications")}</label><div className="button-row"><button className="primary" disabled={busy}>{mutationBusy ? t("Traitement…", "Processing…") : t("Déposer et analyser", "Upload and scan")}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>{t("Annuler", "Cancel")}</button></div></fieldset></form></section>}
    <section className="admin-card">
      <div className="moderator-toolbar"><h2>{t("Documents gérés", "Managed documents")}</h2><button type="button" disabled={busy} onClick={() => loadPage(documentPage)}><Icon name="sync" />{t("Actualiser", "Refresh")}</button></div>
      <form className="moderator-search" role="search" onSubmit={(event) => { event.preventDefault(); searchQuery.current = search.trim(); loadPage(1); }}><label>{t("Rechercher un document", "Search documents")}<input type="search" maxLength={200} value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label><button type="submit" disabled={busy}><Icon name="search" />{t("Rechercher", "Search")}</button>{searchQuery.current && <button type="button" disabled={busy} onClick={() => { setSearch(""); searchQuery.current = ""; loadPage(1); }}>{t("Réinitialiser", "Reset")}</button>}</form>
      <div className="admin-table-wrap"><table aria-busy={loading}><thead><tr><th>{t("Titre", "Title")}</th><th>{t("Espace", "Space")}</th><th>{t("Catégorie", "Category")}</th><th>{t("Version", "Version")}</th><th>{t("État", "Status")}</th><th>{t("Actions", "Actions")}</th></tr></thead><tbody>
        {loading && <tr><td colSpan={6} role="status">{t("Chargement…", "Loading…")}</td></tr>}
        {!loading && !documents.length && <tr><td colSpan={6}>{t("Aucun document géré sur cette page.", "No managed document on this page.")}</td></tr>}
        {!loading && documents.map((document) => {
          const space = spacesById.get(document.space.id);
          const canEdit = !!space?.permissions.edit;
          const canPublish = !!space?.permissions.publish;
          const canArchive = !!space?.permissions.archive;
          const latest = latestVersion(document);
          return <tr key={document.id}>
            <td data-label={t("Titre", "Title")}>{document.translations.find((item) => item.locale === locale)?.title || document.translations[0]?.title}</td>
            <td data-label={t("Espace", "Space")}>{locale === "fr" ? document.space.nameFr : document.space.nameEn}</td>
            <td data-label={t("Catégorie", "Category")}>{document.category ? locale === "fr" ? document.category.nameFr : document.category.nameEn : t("Sans catégorie", "No category")}</td>
            <td data-label={t("Version", "Version")}>{latest ? `v${latest.version}` : "-"}</td>
            <td data-label={t("État", "Status")}>{({ DRAFT: t("Brouillon", "Draft"), PUBLISHED: t("Publié", "Published"), ARCHIVED: t("Archivé", "Archived"), QUARANTINED: t("En quarantaine", "Quarantined") } as Record<string, string>)[document.status] || document.status}</td>
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
