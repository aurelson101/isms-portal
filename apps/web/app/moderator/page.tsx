"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";

type Space = { id: string; nameFr: string; nameEn: string; permissions: Record<string, boolean> };
type Identity = { displayName: string; username: string; isAdmin: boolean; isModerator?: boolean; locale: "fr" | "en" | null; spaces: Space[] };
type Document = { id: string; status: string; space: { id: string; nameFr: string; nameEn: string }; category: { id: string; nameFr: string; nameEn: string } | null; translations: Array<{ locale: string; title: string; description: string | null }>; versions: Array<{ id: string; locale: string; version: number }> };
type Category = { id: string; parentId: string | null; nameFr: string; nameEn: string };

const messageOf = async (response: Response) => {
  const body = await response.json().catch(() => null);
  return body?.message || "Request failed";
};

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
  const [metadataBusy, setMetadataBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const loadRequest = useRef(0);
  const mutationInFlight = useRef(false);
  const busy = loading || mutationBusy || metadataBusy;
  const locale = identity?.locale === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;
  const load = useCallback(async (page = 1) => {
    const request = ++loadRequest.current;
    setLoading(true);
    try {
    const [me, list] = await Promise.all([fetch("/api/me", { cache: "no-store" }), fetch(`/api/documents?page=${page}&limit=20&managed=true`, { cache: "no-store" })]);
    if (request !== loadRequest.current) return;
    if (!me.ok) { window.location.assign("/login?return=/moderator"); return; }
    const current = await me.json() as Identity;
    if (request !== loadRequest.current) return;
    if (!current.isAdmin && !current.isModerator) { window.location.assign("/"); return; }
    if (!list.ok) throw new Error(await messageOf(list));
    const payload = await list.json();
    if (request !== loadRequest.current) return;
    setIdentity(current);
    if (!Array.isArray(payload) && payload.page !== page) {
      setDocumentPage(payload.page);
      return;
    }
    setDocuments(Array.isArray(payload) ? payload : payload.items || []);
    setDocumentTotalPages(Array.isArray(payload) ? 1 : Math.max(1, payload.totalPages || 1));
    } catch (reason) {
      if (request === loadRequest.current) throw reason;
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(documentPage).catch((reason) => setError(reason.message));
    return () => { loadRequest.current++; };
  }, [documentPage, load]);
  const editable = useMemo(() => identity?.spaces.filter((space) => space.permissions.edit || space.permissions.publish || space.permissions.archive) || [], [identity]);
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
    const latest = document.versions.slice().sort((left, right) => right.version - left.version)[0];
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
      selectMetadataLocale(document, document.versions[0]?.locale === "en" ? "en" : "fr");
      setEditing(null);
      setMetadataEditing(document);
      window.setTimeout(() => window.document.getElementById("moderator-metadata-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    });
  };
  if (!identity) return <main className="admin-main"><p>{t("Chargement de l’espace modérateur…", "Loading moderator workspace…")}</p>{error && <p className="error-state">{error}</p>}</main>;
  return <main className="admin-main moderator-workspace">
    <header className="admin-page-heading"><div><p className="eyebrow">ISMS Portal</p><h1>{t("Espace modérateur", "Moderator workspace")}</h1><p>{t("Gestion documentaire limitée à vos droits effectifs.", "Document management limited to your effective permissions.")}</p></div><a className="button" href="/explorer">{t("Retour au portail", "Back to portal")}</a></header>
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error-state" role="alert">{error}</p>}
    <section className="admin-card"><h2>{t("Mes droits documentaires", "My document permissions")}</h2><div className="admin-account-list">{editable.map((space) => <div key={space.id}><span><strong>{locale === "fr" ? space.nameFr : space.nameEn}</strong><small>{[space.permissions.edit && t("modifier", "edit"), space.permissions.publish && t("publier", "publish"), space.permissions.archive && t("archiver / supprimer", "archive / delete")].filter(Boolean).join(" · ")}</small></span></div>)}{!editable.length && <p className="admin-empty compact">{t("Aucun droit de gestion documentaire n’est attribué.", "No document management right is assigned.")}</p>}</div></section>
    {metadataEditing && <section className="admin-card" id="moderator-metadata-form">
      <h2>{t("Éditer les métadonnées", "Edit metadata")}</h2>
      <form className="admin-form upload-form" onSubmit={async (event) => {
        event.preventDefault();
        if (mutationInFlight.current) return;
        mutationInFlight.current = true;
        setMetadataBusy(true); setError(""); setNotice("");
        try {
          const response = await fetch(`/api/documents/${metadataEditing.id}/metadata`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale: metadataLocale, versionId: metadataEditing.versions[0]?.id, title: metadataTitle.trim(), description: metadataDescription.trim(), categoryId: metadataCategoryId || null }),
          });
          if (!response.ok) throw new Error(await messageOf(response));
          setMetadataEditing(null); setNotice(t("Métadonnées enregistrées.", "Metadata saved.")); await load(documentPage);
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { mutationInFlight.current = false; setMetadataBusy(false); }
      }}>
        <label>{t("Langue du document", "Document language")}<select value={metadataLocale} onChange={(event) => selectMetadataLocale(metadataEditing, event.target.value as "fr" | "en")}><option value="fr">FR</option><option value="en">EN</option></select></label>
        <label>{t("Titre", "Title")}<input required maxLength={255} value={metadataTitle} onChange={(event) => setMetadataTitle(event.target.value)} /></label>
        <label>{t("Description", "Description")}<textarea maxLength={2000} value={metadataDescription} onChange={(event) => setMetadataDescription(event.target.value)} /></label>
        <label>{t("Catégorie", "Category")}<select value={metadataCategoryId} onChange={(event) => setMetadataCategoryId(event.target.value)}><option value="">{t("Sans catégorie", "No category")}</option>{metadataCategories.map((category) => <option key={category.id} value={category.id}>{locale === "fr" ? category.nameFr : category.nameEn}</option>)}</select></label>
        <div className="button-row"><button className="primary" disabled={busy || !metadataTitle.trim()}>{t("Enregistrer", "Save")}</button><button type="button" disabled={busy} onClick={() => setMetadataEditing(null)}>{t("Annuler", "Cancel")}</button></div>
      </form>
    </section>}
    {editing && <section className="admin-card"><h2>{t("Déposer une nouvelle version", "Upload a new version")}</h2><p><strong>{editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title}</strong> · {t("espace", "space")}: {locale === "fr" ? editing.space.nameFr : editing.space.nameEn}</p><form className="admin-form upload-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      await mutate(async () => {
        const response = await fetch("/api/documents/upload", { method: "POST", body: data });
        if (!response.ok) throw new Error(await messageOf(response));
        setEditing(null);
        setNotice(t("Nouvelle version déposée et analysée.", "New version uploaded and scanned."));
        await load(documentPage);
      });
    }}><input name="documentId" type="hidden" value={editing.id} /><input name="spaceId" type="hidden" value={editing.space.id} /><label>{t("Langue", "Language")}<select name="locale" value={versionLocale} onChange={(event) => setVersionLocale(event.target.value as "fr" | "en")}><option value="fr">FR</option><option value="en">EN</option></select></label><label>{t("Titre", "Title")}<input key={`${editing.id}-${versionLocale}`} name="title" required defaultValue={editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title || ""} /></label><label className="wide">{t("Résumé des changements", "Change summary")}<textarea name="changeSummary" required maxLength={2000} /></label><label>{t("Fichier", "File")}<input name="file" type="file" required accept=".pdf,.docx,.xlsx" /></label><label className="check"><input name="suppressEmailNotifications" value="true" type="checkbox" />{t("Ne pas envoyer d’e-mail", "Do not send email notifications")}</label><div className="button-row"><button className="primary" disabled={busy}>{mutationBusy ? t("Traitement…", "Processing…") : t("Déposer et analyser", "Upload and scan")}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>{t("Annuler", "Cancel")}</button></div></form></section>}
    <section className="admin-card">
      <h2>{t("Documents gérés", "Managed documents")}</h2>
      <div className="admin-table-wrap"><table aria-busy={loading}><thead><tr><th>{t("Titre", "Title")}</th><th>{t("Espace", "Space")}</th><th>{t("État", "Status")}</th><th>{t("Actions", "Actions")}</th></tr></thead><tbody>
        {loading && <tr><td colSpan={4} role="status">{t("Chargement…", "Loading…")}</td></tr>}
        {!loading && !documents.length && <tr><td colSpan={4}>{t("Aucun document géré sur cette page.", "No managed document on this page.")}</td></tr>}
        {!loading && documents.map((document) => {
          const space = identity.spaces.find((item) => item.id === document.space.id);
          const canEdit = !!space?.permissions.edit;
          const canPublish = !!space?.permissions.publish;
          const canArchive = !!space?.permissions.archive;
          return <tr key={document.id}>
            <td data-label={t("Titre", "Title")}>{document.translations.find((item) => item.locale === locale)?.title || document.translations[0]?.title}</td>
            <td data-label={t("Espace", "Space")}>{locale === "fr" ? document.space.nameFr : document.space.nameEn}</td>
            <td data-label={t("État", "Status")}>{document.status}</td>
            <td data-label={t("Actions", "Actions")}><div className="document-actions">
              {canEdit && <button className="document-action" type="button" disabled={busy} onClick={() => void openMetadata(document).catch((reason) => setError(reason.message))}><Icon name="documents" />{t("Éditer", "Edit")}</button>}
              {canEdit && <button className="document-action" type="button" disabled={busy} onClick={() => openVersion(document)}><Icon name="upload" />{t("Nouvelle version", "New version")}</button>}
              {canPublish && document.status !== "PUBLISHED" && <button className="document-action publish" type="button" disabled={busy} onClick={() => void action(document.id, "publish")}><Icon name="publish" />{t("Publier", "Publish")}</button>}
              {canArchive && document.status !== "ARCHIVED" && <button className="document-action archive" type="button" disabled={busy} onClick={() => void action(document.id, "archive")}><Icon name="archive" />{t("Archiver", "Archive")}</button>}
              {canArchive && <button className="document-action delete" type="button" disabled={busy} onClick={() => { if (window.confirm(t("Supprimer ce document ?", "Delete this document?"))) void action(document.id, "delete"); }}><Icon name="delete" />{t("Supprimer", "Delete")}</button>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>
      {documentTotalPages > 1 && <nav className="document-pagination" aria-label={t("Pagination des documents", "Document pagination")}><button type="button" disabled={busy || documentPage <= 1} onClick={() => setDocumentPage((page) => page - 1)}>← {t("Précédent", "Previous")}</button><span>{t("Page", "Page")} {documentPage} {t("sur", "of")} {documentTotalPages}</span><button type="button" disabled={busy || documentPage >= documentTotalPages} onClick={() => setDocumentPage((page) => page + 1)}>{t("Suivant", "Next")} →</button></nav>}
    </section>
  </main>;
}
