"use client";
import { fetchWithTimeout as fetch, RequestTimeoutError } from "../http-client";
import { loginDestination } from "../auth-navigation";
import { uploadAttempt, type UploadAttempt } from "../upload-attempt";

import { translate } from "../i18n/translate";
import { useInterfaceLocale } from "../i18n/use-locale";
import { isLocale, type Locale } from "../i18n/locale";
import { LanguageButtons, ProfileLanguage } from "../language-controls";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { useBranding } from "../branding";
import { responseMessage } from "../request-errors";

import { MetadataForm, VersionForm } from "./document-forms";
import { BatchImport } from "../batch-import";
import { documentFilters, documentPage as parseDocumentPage, latestVersion, translationFields, validateUpload, type Space, type Category, type ModeratorDocument as Document, type MetadataValues } from "./document-model";

type Identity = { isAdmin: boolean; isModerator?: boolean; locale: Locale | null; spaces: Space[]; username?: string; displayName?: string; profilePhoto?: string | null };

const messageOf = (response: Response) => responseMessage(response, "Request failed");

export default function ModeratorPage() {
  const branding = useBranding();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("documents");
  const metadataOnly = activeSection === "metadata";
  const documentView = activeSection === "documents" || metadataOnly;
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const profileDetails = useRef<HTMLDetailsElement>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentPage, setDocumentPage] = useState(1);
  const [documentTotalPages, setDocumentTotalPages] = useState(1);
  const [editing, setEditing] = useState<Document | null>(null);
  const [versionLocale, setVersionLocale] = useState<Locale>("fr");
  const [metadataEditing, setMetadataEditing] = useState<Document | null>(null);
  const [metadata, setMetadata] = useState<MetadataValues>({ locale: "fr", title: "", description: "", categoryId: "" });
  const [metadataCategories, setMetadataCategories] = useState<Category[]>([]);
  const [notice, setNotice] = useState<"updated" | "metadata" | "version" | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [hasActiveSearch, setHasActiveSearch] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState("");
  const spaceFilter = useRef("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const statusFilter = useRef("");
  const searchQuery = useRef("");
  const loadRequest = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const mutationInFlight = useRef(false);
  const uploadRetry = useRef<UploadAttempt | null>(null);
  const dirty = useRef(false);
  const importPending = useRef(false);
  const busy = loading || mutationBusy;
  const [locale, changeLocale] = useInterfaceLocale();
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const accountName = identity?.displayName || identity?.username || t("Espace modérateur", "Moderator workspace");
  const noticeLabels = {
    updated: t("Document mis à jour.", "Document updated."),
    metadata: t("Métadonnées enregistrées.", "Metadata saved."),
    version: t("Nouvelle version déposée et analysée.", "New version uploaded and scanned."),
  };
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
    if (spaceFilter.current) query.set("space", spaceFilter.current);
    if (statusFilter.current) query.set("status", statusFilter.current);
    const [me, list] = await Promise.all([fetch("/api/me", { cache: "no-store", signal: controller.signal }), fetch(`/api/documents?${query}`, { cache: "no-store", signal: controller.signal })]);
    if (request !== loadRequest.current) return;
    if (me.status === 401 || list.status === 401) { window.location.assign(loginDestination()); return; }
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
    const url = new URL(window.location.href);
    for (const key of ["q", "space", "status", "page"]) {
      const value = key === "page" ? result.page > 1 ? String(result.page) : "" : query.get(key);
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (reason) {
      if (request === loadRequest.current) throw timedOut ? new RequestTimeoutError(false) : reason;
    } finally {
      window.clearTimeout(timeout);
      if (request === loadRequest.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const filters = documentFilters(new URLSearchParams(window.location.search));
    spaceFilter.current = filters.space;
    statusFilter.current = filters.status;
    searchQuery.current = filters.q;
    setSelectedSpace(filters.space);
    setSelectedStatus(filters.status);
    setSearch(filters.q);
    setHasActiveSearch(Boolean(filters.q));
    void load(filters.page).catch((reason) => setError(reason.message));
    const requests = loadRequest;
    const controller = loadController;
    return () => { requests.current++; controller.current?.abort(); };
  }, [load]);
  useEffect(() => {
    if (!documentView || !identity || mutationBusy || editing || metadataEditing || search.trim() === searchQuery.current) return;
    const timeout = window.setTimeout(() => {
      if (search.trim() === searchQuery.current) return;
      searchQuery.current = search.trim();
      setHasActiveSearch(Boolean(searchQuery.current));
      setError("");
      void load(1).catch((reason) => setError(reason.message));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [activeSection, documentView, search, identity, mutationBusy, editing, metadataEditing, load]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  useEffect(() => {
    const selectSection = () => {
      const section = window.location.hash.replace(/^#moderator-/, "");
      setActiveSection(["documents", "metadata", "import", "permissions"].includes(section) ? section : "documents");
      if (section === "permissions") {
        const details = document.getElementById("moderator-permissions");
        if (details instanceof HTMLDetailsElement) details.open = true;
      }
    };
    selectSection();
    window.addEventListener("hashchange", selectSection);
    return () => window.removeEventListener("hashchange", selectSection);
  }, [identity]);
  useEffect(() => {
    if (!navigationOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setNavigationOpen(false);
      navigationToggle.current?.focus();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navigationOpen]);
  useEffect(() => {
    const closeProfile = (event: PointerEvent) => {
      if (!profileDetails.current?.contains(event.target as Node)) profileDetails.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeProfile);
    return () => document.removeEventListener("pointerdown", closeProfile);
  }, []);
  const canDiscard = () => (!dirty.current && !importPending.current) || window.confirm(t("Abandonner les modifications non enregistrées ?", "Discard unsaved changes?"));
  const closeEditor = (force = false) => {
    if (!force && !canDiscard()) return;
    dirty.current = false;
    setEditing(null);
    setMetadataEditing(null);
  };
  const selectView = (section: string) => {
    if (busy) return false;
    setActiveSection(section);
    setNavigationOpen(false);
    return true;
  };
  const loadPage = (page: number) => { setError(""); void load(page).catch((reason) => setError(reason.message)); };
  const permissionsSpaces = useMemo(() => identity?.spaces.filter((space) => space.permissions.upload || space.permissions.edit || space.permissions.publish || space.permissions.archive) || [], [identity]);
  const editable = useMemo(() => permissionsSpaces.filter((space) => space.permissions.edit || space.permissions.publish || space.permissions.archive), [permissionsSpaces]);
  const currentSpace = editable.find(space => space.slug === selectedSpace);
  const selectSpace = (slug: string) => {
    if (busy) return false;
    if (spaceFilter.current !== slug) {
      if (!canDiscard()) return false;
      closeEditor(true);
      spaceFilter.current = slug;
      setSelectedSpace(slug);
      loadPage(1);
    }
    setActiveSection("documents");
    setNavigationOpen(false);
    return true;
  };
  const spacesById = useMemo(() => new Map(identity?.spaces.map((space) => [space.id, space]) || []), [identity]);
  const rows = useMemo(() => documents.map((document) => ({
    document, latest: latestVersion(document), title: translationFields(document, locale).title,
    permissions: document.permissions ?? spacesById.get(document.space.id)?.permissions,
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
    setNotice("updated"); await load(documentPage);
  });
  const openVersion = (document: Document) => {
    if (!canDiscard()) return;
    uploadRetry.current = null;
    dirty.current = false;
    const latest = latestVersion(document);
    setVersionLocale(isLocale(latest?.locale) ? latest.locale : locale);
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
      const currentLocale = latestVersion(document)?.locale;
      const selected = isLocale(currentLocale) ? currentLocale : locale;
      setMetadataCategories(categories as Category[]);
      setMetadata({ locale: selected, ...translationFields(document, selected), categoryId: document.category?.id || "", metadata: document.metadata || {} });
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
        body: JSON.stringify({ expectedUpdatedAt: metadataEditing.updatedAt, locale: metadata.locale, versionId: latestVersion(metadataEditing)?.id,
          title: metadata.title.trim(), description: metadata.description.trim(), categoryId: metadata.categoryId || null, ...(JSON.stringify(metadata.metadata || {}) !== JSON.stringify(metadataEditing.metadata || {}) ? { metadata: metadata.metadata || {} } : {}) }),
      });
      if (!response.ok) throw new Error(await messageOf(response));
      closeEditor(true);
      setNotice("metadata");
      await load(documentPage);
    });
  };
  const uploadVersion = async (data: FormData) => mutate(async () => {
    const response = await fetch("/api/documents/upload", { method: "POST", body: uploadAttempt(validateUpload(data, locale), uploadRetry) });
    if (!response.ok) throw new Error(await messageOf(response));
    closeEditor(true);
    setNotice("version");
    uploadRetry.current = null;
    await load(documentPage);
  });
  if (!identity) return <main className="admin-main moderator-workspace"><p role="status">{t("Chargement de l’espace modérateur…", "Loading moderator workspace…")}</p>{error && <><p className="error-state" role="alert">{error}</p><button type="button" disabled={loading} onClick={() => loadPage(documentPage)}>{t("Réessayer", "Retry")}</button></>}</main>;
  return <div className="admin-shell moderator-shell">
    <aside className={navigationOpen ? "navigation-open" : ""}>
      <div className="sidebar-heading">
        <div className="brand">{branding.logoDataUrl ? <img className="brand-logo" src={branding.logoDataUrl} alt="" /> : <div className="shield"><Icon name="shield" /></div>}<div><strong>{branding.title}</strong><small>{t("Espace modérateur", "Moderator workspace")}</small></div></div>
        <button type="button" ref={navigationToggle} className="navigation-toggle" aria-controls="moderator-navigation" aria-expanded={navigationOpen} aria-label={navigationOpen ? t("Masquer la navigation", "Hide navigation") : t("Afficher la navigation", "Show navigation")} onClick={() => setNavigationOpen(current => !current)}><Icon name={navigationOpen ? "close" : "menu"} /></button>
      </div>
      <nav id="moderator-navigation" aria-label={t("Espace modérateur", "Moderator workspace")}>
        {([
          ["documents", t("Documents", "Documents"), [
          ["documents", "documents", t("Documents gérés", "Managed documents")],
          ["metadata", "documents", t("Métadonnées GED", "GED metadata")],
          ["import", "upload", t("Import de documents", "Document import")],
          ]],
          ["account", t("Mon profil", "My profile"), [
          ["permissions", "rules", t("Mes droits documentaires", "My document permissions")],
          ]],
        ] as const).map(([group, heading, items]) => <details key={group} className="admin-navigation-group" open><summary className="admin-navigation-heading">{heading}<Icon className="submenu-chevron" name="chevron" /></summary><div className="admin-navigation-submenu">{items.map(([section, icon, label]) => <div key={section}><a href={`#moderator-${section}`} className={activeSection === section && (section !== "documents" || !selectedSpace) ? "active" : ""} aria-current={activeSection === section && (section !== "documents" || !selectedSpace) ? "location" : undefined} onClick={(event) => {
          if (!(section === "documents" ? selectSpace("") : selectView(section))) { event.preventDefault(); return; }
          const target = document.getElementById(`moderator-${section}`);
          if (target instanceof HTMLDetailsElement) target.open = true;
          window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
        }}><Icon name={icon} /><span>{label}</span></a>{section === "documents" && <details className="admin-navigation-group" open><summary className="admin-navigation-heading">{t("Espaces documentaires", "Document spaces")}<Icon className="submenu-chevron" name="chevron" /></summary><div className="admin-navigation-submenu">{editable.filter(space => space.slug).map(space => <a key={space.id} href="#moderator-documents" className={activeSection === "documents" && selectedSpace === space.slug ? "active" : ""} aria-current={activeSection === "documents" && selectedSpace === space.slug ? "location" : undefined} onClick={(event) => { if (!selectSpace(space.slug!)) event.preventDefault(); }}><Icon name="folder" /><span>{locale === "fr" ? space.nameFr : space.nameEn || space.nameFr}</span></a>)}</div></details>}</div>)}</div></details>)}
      </nav>
      <a className="back-link" href="/explorer" onClick={(event) => { if (!canDiscard()) event.preventDefault(); else dirty.current = false; }}><Icon name="home" />{t("Retour au portail", "Back to portal")}</a>
    </aside>
    <main className="admin-main moderator-workspace">
    <header className="moderator-management-header">
      {documentView ? <form id="moderator-document-search" className="admin-search" role="search" onSubmit={(event) => { event.preventDefault(); if (busy || editing || metadataEditing) return; searchQuery.current = search.trim(); setHasActiveSearch(Boolean(searchQuery.current)); loadPage(1); }}>
        <Icon name="search" /><input type="search" aria-label={t("Rechercher un document", "Search documents")} placeholder={t("Rechercher un document", "Search documents")} maxLength={200} value={search} disabled={mutationBusy || Boolean(editing || metadataEditing)} onChange={(event) => setSearch(event.target.value)} />
        {search && <button type="button" className="admin-search-clear" aria-label={t("Effacer la recherche", "Clear search")} disabled={mutationBusy || Boolean(editing || metadataEditing)} onClick={() => setSearch("")}><Icon name="close" /></button>}
      </form> : <strong className="moderator-current-section">{activeSection === "import" ? t("Import de documents", "Document import") : t("Mes droits documentaires", "My document permissions")}</strong>}
      <div className="admin-language" role="group" aria-label={t("Langue de l’interface", "Interface language")}><LanguageButtons locale={locale} onChange={changeLocale} /></div>
      <button className="refresh-button" type="button" title={t("Actualiser", "Refresh")} aria-label={t("Actualiser", "Refresh")} disabled={busy} onClick={() => loadPage(documentPage)}><Icon name="sync" /><span>{t("Actualiser", "Refresh")}</span></button>
      <details className="admin-profile" ref={profileDetails} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); profileDetails.current?.removeAttribute("open"); profileDetails.current?.querySelector("summary")?.focus(); } }}>
        <summary className="admin-profile-button" aria-label={t("Mon profil", "My profile")}>
          {identity.profilePhoto ? <img src={identity.profilePhoto} alt="" /> : <span className="admin-avatar" aria-hidden="true">{accountName.split(/\s+/u).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span>}
          <span className="admin-identity"><strong>{accountName}</strong><small>{identity.username}</small></span><span aria-hidden="true"><Icon name="chevron" /></span>
        </summary>
        <div className="account-menu admin-profile-menu"><strong>{accountName}</strong><small>{identity.username}</small><ProfileLanguage locale={locale} defaultLocale={identity.locale} onChange={next => { changeLocale(next); setIdentity(current => current ? { ...current, locale: next } : current); }} /><a href="#moderator-permissions" onClick={event => { if (!selectView("permissions")) event.preventDefault(); else profileDetails.current?.removeAttribute("open"); }}>{t("Mes droits documentaires", "My document permissions")}</a><a href="/explorer?workspace=preferences" onClick={event => { if (!canDiscard()) event.preventDefault(); else dirty.current = false; }}>{t("Préférences d’affichage", "Display preferences")}</a><a href="/explorer" onClick={event => { if (!canDiscard()) event.preventDefault(); else dirty.current = false; }}>{t("Retour au portail", "Back to portal")}</a></div>
      </details>
    </header>
    <div className="admin-page-heading"><div><h1>{t("Espace modérateur", "Moderator workspace")}</h1><p>{t("Gestion documentaire limitée à vos droits effectifs.", "Document management limited to your effective permissions.")}</p></div></div>
    {notice && <p className="notice" role="status">{noticeLabels[notice]}</p>}{error && <p className="error-state" role="alert">{error}</p>}
    <details id="moderator-permissions" hidden={activeSection !== "permissions"} tabIndex={-1} className="moderator-permissions"><summary>{t("Mes droits documentaires", "My document permissions")} <span>{permissionsSpaces.length}</span></summary><div className="admin-account-list">{permissionsSpaces.map((space) => <div key={space.id}><span><strong>{locale === "fr" ? space.nameFr : space.nameEn || space.nameFr}</strong><small>{[space.permissions.upload && t("Déposer", "Upload"), space.permissions.edit && t("modifier", "edit"), space.permissions.publish && t("publier", "publish"), space.permissions.archive && t("archiver / supprimer", "archive / delete")].filter(Boolean).join(" · ")}</small></span></div>)}{!permissionsSpaces.length && <p className="admin-empty compact">{t("Aucun droit de gestion documentaire n’est attribué.", "No document management right is assigned.")}</p>}</div></details>
    <section id="moderator-import" hidden={activeSection !== "import"} tabIndex={-1}><BatchImport locale={locale} disabled={busy || Boolean(editing || metadataEditing)} onComplete={() => load(documentPage)} onBusyChange={setMutationBusy} onPendingChange={(pending) => { importPending.current = pending; }} /></section>
    <div className="moderator-document-view" hidden={!documentView}>
    {metadataEditing && <MetadataForm document={metadataEditing} categories={metadataCategories} value={metadata} onChange={setMetadata} onSave={saveMetadata} busy={busy} locale={locale} onCancel={() => closeEditor()} onDirty={() => { dirty.current = true; }} />}
    <div hidden={metadataOnly}>{editing && <VersionForm key={editing.id} document={editing} versionLocale={versionLocale} onLocaleChange={setVersionLocale} onUpload={uploadVersion} busy={busy} locale={locale} onCancel={() => closeEditor()} onDirty={() => { dirty.current = true; }} />}</div>
    <section id={metadataOnly ? "moderator-metadata" : "moderator-documents"} tabIndex={-1} className="moderator-section">
      <div className="moderator-toolbar"><h2>{metadataOnly ? t("Métadonnées GED", "GED metadata") : t("Documents gérés", "Managed documents")}{currentSpace && ` : ${locale === "fr" ? currentSpace.nameFr : currentSpace.nameEn || currentSpace.nameFr}`}</h2></div>
      <div className="moderator-search">
        <label className="moderator-status-filter">{t("État", "Status")}<select value={selectedStatus} disabled={busy || Boolean(editing || metadataEditing)} onChange={event => { statusFilter.current = event.target.value; setSelectedStatus(event.target.value); loadPage(1); }}><option value="">{t("Tous les documents", "All documents")}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="submit" form="moderator-document-search" disabled={busy || Boolean(editing || metadataEditing)}><Icon name="search" />{t("Rechercher", "Search")}</button>
        {(hasActiveSearch || selectedStatus) && <button type="button" disabled={busy || Boolean(editing || metadataEditing)} onClick={() => { setSearch(""); searchQuery.current = ""; setHasActiveSearch(false); statusFilter.current = ""; setSelectedStatus(""); loadPage(1); }}>{t("Réinitialiser", "Reset")}</button>}
      </div>
      <div className="moderator-document-grid" aria-busy={loading}>
        {loading && <p role="status">{t("Chargement…", "Loading…")}</p>}
        {!loading && !documents.length && <p>{t("Aucun document géré sur cette page.", "No managed document on this page.")}</p>}
        {!loading && rows.map(({ document, latest, title, permissions }) => {
          const canEdit = !!permissions?.edit;
          const canPublish = !!permissions?.publish;
          const canArchive = !!permissions?.archive;
          return <article key={document.id} className="moderator-document-card" aria-labelledby={`moderator-title-${document.id}`}>
            <h3 id={`moderator-title-${document.id}`}>{title}</h3>
            <dl>
              <div><dt>{t("Espace", "Space")}</dt><dd>{locale === "fr" ? document.space.nameFr || document.space.nameEn : document.space.nameEn || document.space.nameFr}</dd></div>
              <div><dt>{t("Catégorie", "Category")}</dt><dd>{document.category ? locale === "fr" ? document.category.nameFr || document.category.nameEn : document.category.nameEn || document.category.nameFr : t("Sans catégorie", "No category")}</dd></div>
              <div><dt>{t("Version", "Version")}</dt><dd>{latest ? `v${latest.version}` : "-"}</dd></div>
              <div><dt>{t("État", "Status")}</dt><dd><span className={`moderator-status ${document.status.toLowerCase()}`}>{statusLabels[document.status] || document.status}</span></dd></div>
            </dl>
            {metadataOnly && <p>{Object.values(document.metadata || {}).filter(value => value.trim()).length}/{Object.keys(document.metadata || {}).length} {t("champs renseignés", "fields completed")}</p>}
            <div className="document-actions" role="group" aria-label={t("Actions", "Actions")}>
              {canEdit && <button className="document-action moderator-icon-action" type="button" title={t("Éditer", "Edit")} disabled={busy} onClick={() => void openMetadata(document)}><Icon name="documents" /><span>{t("Éditer", "Edit")}</span></button>}
              {!metadataOnly && canEdit && <button className="document-action moderator-icon-action" type="button" title={t("Nouvelle version", "New version")} disabled={busy} onClick={() => openVersion(document)}><Icon name="upload" /><span>{t("Nouvelle version", "New version")}</span></button>}
              {!metadataOnly && canPublish && document.status !== "PUBLISHED" && <button className="document-action publish" type="button" disabled={busy} onClick={() => void action(document.id, "publish")}><Icon name="publish" />{t("Publier", "Publish")}</button>}
              {!metadataOnly && canArchive && document.status !== "ARCHIVED" && <button className="document-action archive moderator-icon-action" type="button" title={t("Archiver", "Archive")} disabled={busy} onClick={() => void action(document.id, "archive")}><Icon name="archive" /><span>{t("Archiver", "Archive")}</span></button>}
              {!metadataOnly && canArchive && document.status === "ARCHIVED" && <button className="document-action moderator-icon-action" type="button" title={t("Restaurer", "Restore")} disabled={busy} onClick={() => void action(document.id, "restore")}><Icon name="restore" /><span>{t("Restaurer", "Restore")}</span></button>}
              {!metadataOnly && canArchive && <button className="document-action delete moderator-icon-action" type="button" title={t("Supprimer", "Delete")} disabled={busy} onClick={() => { if (window.confirm(t("Supprimer ce document ?", "Delete this document?"))) void action(document.id, "delete"); }}><Icon name="delete" /><span>{t("Supprimer", "Delete")}</span></button>}
            </div>
          </article>;
        })}
      </div>
      <nav className="document-pagination" aria-label={t("Pagination des documents", "Document pagination")}><button type="button" disabled={busy || documentPage <= 1} onClick={() => loadPage(documentPage - 1)}>← {t("Précédent", "Previous")}</button><span aria-live="polite">{t("Page", "Page")} {documentPage} {t("sur", "of")} {documentTotalPages}</span><button type="button" disabled={busy || documentPage >= documentTotalPages} onClick={() => loadPage(documentPage + 1)}>{t("Suivant", "Next")} →</button></nav>
    </section>
    </div>
  </main></div>;
}
