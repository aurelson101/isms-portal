"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import type { Locale } from "./i18n/locale";
import { responseMessage } from "./request-errors";
import { categoryOptions, validateUpload, type Space, type Category } from "./moderator/document-model";
import "./batch-import.css";

type BatchSpace = Space & { categories?: Category[] };
type Item = { key: number; file: File; title: string; documentId?: string; status: "pending" | "uploading" | "draft" | "publishing" | "published" | "failed" | "uncertain" | "quarantined"; error?: string };
class ImportError extends Error {
  constructor(message: string, readonly uncertain = false, readonly status = 0) { super(message); }
}
async function request(path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal });
    if (!response.ok) throw new ImportError(await responseMessage(response, "Request failed"), response.status >= 500, response.status);
    return await response.json();
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError("Network response uncertain; check the document list before uploading again", true);
  } finally { window.clearTimeout(timeout); }
}

export function BatchImport({ locale, disabled = false, onComplete, onBusyChange, onPendingChange }: {
  locale: Locale; disabled?: boolean; onComplete: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void; onPendingChange?: (pending: boolean) => void;
}) {
  const t = (fr: string, en: string) => locale === "fr" ? fr : en;
  const [open, setOpen] = useState(false);
  const [spaces, setSpaces] = useState<BatchSpace[]>([]);
  const [loading, setLoading] = useState(false);
  const [spaceId, setSpaceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [fileLocale, setFileLocale] = useState<Locale>(locale);
  const [publish, setPublish] = useState(false);
  const [notifications, setNotifications] = useState("digest");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [digestPending, setDigestPending] = useState<string[]>([]);
  const notifiedIds = useRef(new Set<string>());
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  const locked = items.some((item) => item.documentId || item.status === "uncertain");
  const pending = running || digestPending.length > 0 || items.some((item) => ["pending", "failed", "uncertain"].includes(item.status));
  const labels: Record<Item["status"], string> = {
    pending: t("En attente", "Pending"), uploading: t("Analyse en cours", "Scanning"), draft: t("Brouillon", "Draft"),
    publishing: t("Publication", "Publishing"), published: t("Publié", "Published"), failed: t("Échec", "Failed"),
    uncertain: t("À vérifier avant reprise", "Check before retry"), quarantined: t("En quarantaine", "Quarantined"),
  };
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    void fetch("/api/me", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(await responseMessage(response, "Session unavailable"));
      const identity = await response.json();
      if (!identity.isAdmin && !identity.isModerator) throw new Error("Moderator or administrator access required");
      setSpaces((identity.spaces as BatchSpace[]).filter((space) => space.permissions.upload));
    }).catch((reason) => { if (active) setError(reason.message); })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [open]);
  useEffect(() => {
    onPendingChange?.(pending);
    const protect = (event: BeforeUnloadEvent) => { if (pending) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [pending, onPendingChange]);
  const update = (item: Item) => setItems((current) => current.map((row) => row.key === item.key ? item : row));
  const queueSummary = async (ids: string[]) => {
    if (!ids.length) return;
    setDigestPending(ids);
    await request("/api/documents/publication-digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: ids }) });
    ids.forEach((id) => notifiedIds.current.add(id));
    setDigestPending([]);
    setNotice(t("Récapitulatif placé dans la file d’envoi.", "Summary queued for delivery."));
  };
  const begin = () => { if (inFlight.current) return false; inFlight.current = true; setRunning(true); onBusyChange?.(true); setError(""); setNotice(""); return true; };
  const finish = () => { inFlight.current = false; setRunning(false); onBusyChange?.(false); };
  const run = async () => {
    if (!selectedSpace || !items.length || !begin()) return;
    const result = [...items];
    try {
      for (let index = 0; index < result.length; index++) {
        let item = result[index];
        if (!["pending", "failed"].includes(item.status)) continue;
        try {
          if (!item.documentId) {
            const data = new FormData();
            data.set("spaceId", spaceId); data.set("categoryId", categoryId); data.set("locale", fileLocale);
            data.set("title", item.title); data.set("changeSummary", "Initial version");
            data.set("file", item.file); data.set("suppressEmailNotifications", "true");
            validateUpload(data, locale);
            item = { ...item, status: "uploading", error: undefined }; update(item);
            const document = await request("/api/documents/upload", { method: "POST", body: data });
            if (typeof document?.id !== "string") throw new ImportError("Upload response uncertain; check the document list", true);
            item = { ...item, documentId: document.id, status: document.status === "QUARANTINED" ? "quarantined" : "draft" }; update(item);
          }
          if (publish && item.status !== "quarantined") {
            item = { ...item, status: "publishing" }; update(item);
            await request(`/api/documents/${encodeURIComponent(item.documentId!)}/publish`, { method: "POST" });
            item = { ...item, status: "published" };
          }
        } catch (reason) {
          item = { ...item, status: reason instanceof ImportError && reason.uncertain ? "uncertain" : "failed", error: (reason as Error).message };
          result[index] = item; update(item);
          if (reason instanceof ImportError && [401, 403, 404].includes(reason.status)) break;
          continue;
        }
        result[index] = item; update(item);
      }
      setNotice(t("Traitement du lot terminé.", "Batch processing complete."));
      if (publish && notifications === "digest") await queueSummary(result.filter((item) => item.status === "published" && item.documentId && !notifiedIds.current.has(item.documentId)).map((item) => item.documentId!));
      await onComplete();
    } catch (reason) { setError((reason as Error).message); }
    finally { finish(); }
  };
  const completed = items.filter((item) => ["draft", "published", "quarantined", "failed", "uncertain"].includes(item.status)).length;
  return <section className="batch-import">
    <div className="batch-heading"><h2>{t("Import de documents", "Document import")}</h2><button type="button" disabled={disabled || running || pending} aria-expanded={open} aria-controls="batch-import-form" onClick={() => { setError(""); setOpen(!open); }}><Icon name="upload" />{t("Importer un lot", "Import a batch")}</button></div>
    {open && <form id="batch-import-form" onSubmit={(event) => { event.preventDefault(); void run(); }} aria-busy={running || loading}>
      <fieldset className="batch-options" disabled={disabled || running || loading || locked}>
        <label>{t("Espace", "Space")}<select required value={spaceId} onChange={(event) => { setSpaceId(event.target.value); setCategoryId(""); }}><option value="">{t("Sélectionner…", "Select…")}</option>{spaces.map((space) => <option key={space.id} value={space.id}>{locale === "fr" ? space.nameFr : space.nameEn}</option>)}</select></label>
        <label>{t("Catégorie", "Category")}<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{t("Sans catégorie", "No category")}</option>{categoryOptions(selectedSpace?.categories || [], locale).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label>{t("Langue des fichiers", "File language")}<select value={fileLocale} onChange={(event) => setFileLocale(event.target.value as Locale)}><option value="fr">FR</option><option value="en">EN</option></select></label>
        <label>{t("Notifications e-mail", "Email notifications")}<select value={notifications} onChange={(event) => setNotifications(event.target.value)}><option value="digest">{t("Récapitulatif groupé des publications", "Grouped publication summary")}</option><option value="none">{t("Ne pas envoyer d’e-mail", "Do not send email")}</option></select></label>
        <label className="batch-check"><input type="checkbox" checked={publish} disabled={!selectedSpace?.permissions.publish} onChange={(event) => setPublish(event.target.checked)} />{t("Publier après analyse", "Publish after scanning")}</label>
        <label className="batch-files">{t("Fichiers PDF, DOCX, XLSX · 200 maximum · 50 Mo par fichier", "PDF, DOCX, XLSX files · up to 200 · 50 MB per file")}<input ref={fileInput} type="file" multiple accept=".pdf,.docx,.xlsx" onChange={(event) => {
          const files = Array.from(event.target.files || []);
          setError(""); setNotice("");
          if (files.length > 200) { setError(t("Maximum 200 fichiers par lot.", "Maximum 200 files per batch.")); event.target.value = ""; setItems([]); return; }
          setItems(files.map((file, key) => ({ key, file, title: file.name.replace(/\.[^.]+$/, "").slice(0, 255), status: "pending" })));
        }} /></label>
      </fieldset>
      {items.length > 0 && <><progress max={items.length} value={completed} aria-label={t("Progression de l’import", "Import progress")} /><p role="status">{completed} / {items.length}</p><ol className="batch-items">{items.map((item) => <li key={item.key}><span>{item.file.name}</span><label>{t("Titre", "Title")}<input required maxLength={255} value={item.title} disabled={running || Boolean(item.documentId) || item.status === "uncertain"} onChange={(event) => update({ ...item, title: event.target.value })} /></label><strong>{labels[item.status]}</strong>{item.error && <p className="error-state">{item.error}</p>}</li>)}</ol></>}
      {loading && <p role="status">{t("Chargement…", "Loading…")}</p>}{error && <p role="alert" className="error-state">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
      <div className="button-row"><button className="primary" disabled={disabled || running || loading || digestPending.length > 0 || !items.some((item) => ["pending", "failed"].includes(item.status))}>{t("Traiter le lot", "Process batch")}</button>
        {digestPending.length > 0 && <button type="button" disabled={running} onClick={async () => { if (!begin()) return; try { await queueSummary(digestPending); await onComplete(); } catch (reason) { setError((reason as Error).message); } finally { finish(); } }}>{t("Réessayer le récapitulatif", "Retry summary")}</button>}
        {items.length > 0 && <button type="button" disabled={running} onClick={() => {
          if (pending && !window.confirm(t("Abandonner les éléments en attente ? Les documents déjà déposés seront conservés.", "Discard pending items? Uploaded documents will be kept."))) return;
          setItems([]); setDigestPending([]); notifiedIds.current.clear(); setError(""); setNotice(""); if (fileInput.current) fileInput.current.value = "";
        }}>{t("Nouveau lot", "New batch")}</button>}</div>
    </form>}
  </section>;
}
