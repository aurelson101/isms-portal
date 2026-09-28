"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Space = { id: string; nameFr: string; nameEn: string; permissions: Record<string, boolean> };
type Identity = { displayName: string; username: string; isAdmin: boolean; isModerator?: boolean; locale: "fr" | "en" | null; spaces: Space[] };
type Document = { id: string; status: string; space: { id: string; nameFr: string; nameEn: string }; translations: Array<{ locale: string; title: string }>; versions: Array<{ locale: string; version: number }> };

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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const locale = identity?.locale === "en" ? "en" : "fr";
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;
  const load = useCallback(async (page = 1) => {
    const [me, list] = await Promise.all([fetch("/api/me", { cache: "no-store" }), fetch(`/api/documents?page=${page}&limit=20&managed=true`, { cache: "no-store" })]);
    if (!me.ok) { window.location.assign("/login?return=/moderator"); return; }
    const current = await me.json() as Identity;
    if (!current.isAdmin && !current.isModerator) { window.location.assign("/"); return; }
    setIdentity(current);
    if (!list.ok) throw new Error(await messageOf(list));
    const payload = await list.json();
    if (!Array.isArray(payload) && payload.page !== page) {
      setDocumentPage(payload.page);
      return;
    }
    setDocuments(Array.isArray(payload) ? payload : payload.items || []);
    setDocumentTotalPages(Array.isArray(payload) ? 1 : Math.max(1, payload.totalPages || 1));
  }, []);
  useEffect(() => { void load(documentPage).catch((reason) => setError(reason.message)); }, [documentPage, load]);
  const editable = useMemo(() => identity?.spaces.filter((space) => space.permissions.edit || space.permissions.publish || space.permissions.archive) || [], [identity]);
  const action = async (id: string, name: "publish" | "archive" | "restore" | "delete") => {
    setError(""); setNotice("");
    const endpoint = await fetch(
      name === "delete" ? `/api/documents/${id}` : `/api/documents/${id}/${name}`,
      { method: name === "delete" ? "DELETE" : "POST" },
    );
    if (!endpoint.ok) throw new Error(await messageOf(endpoint));
    setNotice(t("Document mis à jour.", "Document updated.")); await load(documentPage);
  };
  const openVersion = (document: Document) => {
    const latest = document.versions.slice().sort((left, right) => right.version - left.version)[0];
    setVersionLocale(latest?.locale === "en" ? "en" : latest?.locale === "fr" ? "fr" : locale);
    setEditing(document);
  };
  if (!identity) return <main className="admin-main"><p>{t("Chargement de l’espace modérateur…", "Loading moderator workspace…")}</p>{error && <p className="error-state">{error}</p>}</main>;
  return <main className="admin-main moderator-workspace">
    <header className="admin-page-heading"><div><p className="eyebrow">ISMS Portal</p><h1>{t("Espace modérateur", "Moderator workspace")}</h1><p>{t("Gestion documentaire limitée à vos droits effectifs.", "Document management limited to your effective permissions.")}</p></div><a className="button" href="/explorer">{t("Retour au portail", "Back to portal")}</a></header>
    {notice && <p className="notice" role="status">{notice}</p>}{error && <p className="error-state" role="alert">{error}</p>}
    <section className="admin-card"><h2>{t("Mes droits documentaires", "My document permissions")}</h2><div className="admin-account-list">{editable.map((space) => <div key={space.id}><span><strong>{locale === "fr" ? space.nameFr : space.nameEn}</strong><small>{[space.permissions.edit && t("modifier", "edit"), space.permissions.publish && t("publier", "publish"), space.permissions.archive && t("archiver / supprimer", "archive / delete")].filter(Boolean).join(" · ")}</small></span></div>)}{!editable.length && <p className="admin-empty compact">{t("Aucun droit de gestion documentaire n’est attribué.", "No document management right is assigned.")}</p>}</div></section>
    {editing && <section className="admin-card"><h2>{t("Déposer une nouvelle version", "Upload a new version")}</h2><p><strong>{editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title}</strong> · {t("espace", "space")}: {locale === "fr" ? editing.space.nameFr : editing.space.nameEn}</p><form className="admin-form upload-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(""); const response = await fetch("/api/documents/upload", { method: "POST", body: new FormData(event.currentTarget) }); if (!response.ok) { setError(await messageOf(response)); return; } setEditing(null); setNotice(t("Nouvelle version déposée et analysée.", "New version uploaded and scanned.")); await load(documentPage); }}><input name="documentId" type="hidden" value={editing.id} /><input name="spaceId" type="hidden" value={editing.space.id} /><label>{t("Langue", "Language")}<select name="locale" value={versionLocale} onChange={(event) => setVersionLocale(event.target.value as "fr" | "en")}><option value="fr">FR</option><option value="en">EN</option></select></label><label>{t("Titre", "Title")}<input key={`${editing.id}-${versionLocale}`} name="title" required defaultValue={editing.translations.find((item) => item.locale === versionLocale)?.title || editing.translations[0]?.title || ""} /></label><label className="wide">{t("Résumé des changements", "Change summary")}<textarea name="changeSummary" required maxLength={2000} /></label><label>{t("Fichier", "File")}<input name="file" type="file" required accept=".pdf,.docx,.xlsx" /></label><label className="check"><input name="suppressEmailNotifications" value="true" type="checkbox" />{t("Ne pas envoyer d’e-mail", "Do not send email notifications")}</label><div className="button-row"><button className="primary">{t("Déposer et analyser", "Upload and scan")}</button><button type="button" onClick={() => setEditing(null)}>{t("Annuler", "Cancel")}</button></div></form></section>}
    <section className="admin-card"><h2>{t("Documents gérés", "Managed documents")}</h2><div className="admin-table-wrap"><table><thead><tr><th>{t("Titre", "Title")}</th><th>{t("Espace", "Space")}</th><th>{t("État", "Status")}</th><th>{t("Actions", "Actions")}</th></tr></thead><tbody>{!documents.length && <tr><td colSpan={4}>{t("Aucun document géré sur cette page.", "No managed document on this page.")}</td></tr>}{documents.map((document) => { const space = identity.spaces.find((item) => item.id === document.space.id); const canEdit = !!space?.permissions.edit; const canPublish = !!space?.permissions.publish; const canArchive = !!space?.permissions.archive; return <tr key={document.id}><td>{document.translations.find((item) => item.locale === locale)?.title || document.translations[0]?.title}</td><td>{locale === "fr" ? document.space.nameFr : document.space.nameEn}</td><td>{document.status}</td><td><div className="document-actions">{canEdit && <button type="button" onClick={() => openVersion(document)}>{t("Nouvelle version", "New version")}</button>}{canPublish && document.status !== "PUBLISHED" && <button type="button" onClick={() => void action(document.id, "publish").catch((reason) => setError(reason.message))}>{t("Publier", "Publish")}</button>}{canArchive && document.status !== "ARCHIVED" && <button type="button" onClick={() => void action(document.id, "archive").catch((reason) => setError(reason.message))}>{t("Archiver", "Archive")}</button>}{canArchive && <button className="danger" type="button" onClick={() => { if (window.confirm(t("Supprimer ce document ?", "Delete this document?"))) void action(document.id, "delete").catch((reason) => setError(reason.message)); }}>{t("Supprimer", "Delete")}</button>}</div></td></tr>; })}</tbody></table></div>{documentTotalPages > 1 && <nav className="document-pagination" aria-label={t("Pagination des documents", "Document pagination")}><button type="button" disabled={documentPage <= 1} onClick={() => setDocumentPage((page) => page - 1)}>← {t("Précédent", "Previous")}</button><span>{t("Page", "Page")} {documentPage} {t("sur", "of")} {documentTotalPages}</span><button type="button" disabled={documentPage >= documentTotalPages} onClick={() => setDocumentPage((page) => page + 1)}>{t("Suivant", "Next")} →</button></nav>}</section>
  </main>;
}
