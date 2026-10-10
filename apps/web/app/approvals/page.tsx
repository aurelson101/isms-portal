"use client";

import { translate, withLocales } from "../i18n/translate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../icons";
import { responseMessage } from "../request-errors";
import { useInterfaceLocale } from "../i18n/use-locale";
import "./approvals.css";

type Item = { id: string; operation: string; targetType: string; targetId: string; requestedBy: string; reason: string; status: string; approvedBy: string | null; approvedAt: string | null; createdAt: string; review?: boolean; canDecide?: boolean; slug?: string; dueAt?: string; reviewer?: string; approver?: string };
type Review = { id: string; owner: string; reviewer: string; approver: string; dueAt: string; status: string; decidedBy: string | null; decidedAt: string | null; createdAt: string; decisionComment: string | null; canDecide: boolean; document: { slug: string; translations: Array<{ title: string; locale: string }> } };
const itemKey = (item: Item) => `${item.review ? "review" : "approval"}-${item.id}`;
const isPending = (status: string) => status === "PENDING" || status === "IN_REVIEW";
const copy = withLocales({
  fr: { title: "Approbations et revues", subtitle: "Décidez, suivez et retrouvez l'historique des demandes.", portal: "Retour au portail", status: "État", period: "Période", year: "Année", month: "Mois", allMonths: "Toute l'année", all: "Toutes", pending: "À traiter", approved: "Approuvées", rejected: "Refusées", refresh: "Actualiser", requests: "demandes", none: "Aucune demande correspondante.", document: "Document", operation: "Opération", requested: "Demandé par", due: "Échéance", reviewer: "Relecteur", approver: "Approbateur", comment: "Commentaire de décision", commentHint: "Ajoutez un commentaire pour expliquer la décision.", open: "Ouvrir le document", approve: "Approuver", reject: "Refuser", decided: "Décision par", history: "Historique", pendingAction: "Votre décision est requise.", cannotDecide: "Consultation uniquement", review: "Revue documentaire", loading: "Chargement des demandes…", error: "Impossible de charger les demandes. Connectez-vous au portail puis réessayez.", confirmApprove: "Confirmer l'approbation de cette demande ?", confirmReject: "Confirmer le refus de cette demande ?" },
  en: { title: "Approvals and Reviews", subtitle: "Decide, track and review the history of requests.", portal: "Back to portal", status: "Status", period: "Period", year: "Year", month: "Month", allMonths: "Full year", all: "All", pending: "Action required", approved: "Approved", rejected: "Rejected", refresh: "Refresh", requests: "requests", none: "No matching requests.", document: "Document", operation: "Operation", requested: "Requested by", due: "Due date", reviewer: "Reviewer", approver: "Approver", comment: "Decision comment", commentHint: "Add a comment explaining the decision.", open: "Open document", approve: "Approve", reject: "Reject", decided: "Decision by", history: "History", pendingAction: "Your decision is required.", cannotDecide: "Read-only", review: "Document review", loading: "Loading requests…", error: "Unable to load requests. Sign in to the portal and try again.", confirmApprove: "Approve this request?", confirmReject: "Reject this request?" },
});

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("ALL");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [month, setMonth] = useState("ALL");
  const [page, setPage] = useState(1);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const deciding = useRef(false);
  const [locale] = useInterfaceLocale();
  const t = copy[locale];
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(translate(locale, "fr-FR", "en-GB"), { dateStyle: "short", timeStyle: "short" }), [locale]);
  const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "-" : dateFormatter.format(parsed); };
  const reload = useCallback(async () => {
    const current = ++request.current;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true); setError("");
    try {
    const query = new URLSearchParams({ year, ...(month === "ALL" ? {} : { month }) });
    const [approvals, reviews] = await Promise.all([fetch(`/api/approvals?${query}`, { cache: "no-store", signal: next.signal }), fetch(`/api/reviews?${query}`, { cache: "no-store", signal: next.signal })]);
    if (!reviews.ok) throw new Error(t.error);
    if (!approvals.ok && approvals.status !== 403) throw new Error(t.error);
    const sensitive = approvals.ok ? await approvals.json() as Item[] : [];
    const assigned = await reviews.json() as Review[];
    if (current !== request.current) return;
    setItems([...sensitive, ...assigned.map((r) => ({ id: r.id, operation: t.review, targetType: t.document, targetId: r.document.translations.find((item) => item.locale === locale)?.title || r.document.translations.find((item) => item.locale === "en")?.title || r.document.translations[0]?.title || r.document.slug, requestedBy: r.owner, reason: r.decisionComment || (translate(locale, "Examinez le document et enregistrez votre décision.", "Review the document and record your decision.")), status: r.status, approvedBy: r.decidedBy, approvedAt: r.decidedAt, createdAt: r.createdAt, review: true, canDecide: r.canDecide, slug: r.document.slug, dueAt: r.dueAt, reviewer: r.reviewer, approver: r.approver }))]);
    } catch (reason) {
      if (current === request.current) setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [locale, month, t.error, t.review, t.document, year]);
  useEffect(() => { void reload(); return () => { request.current++; controller.current?.abort(); }; }, [reload]);
  useEffect(() => { setPage(1); }, [month, year]);
  const changeFilter = (status: string) => { setFilter(status); setPage(1); };
  const decide = async (item: Item, status: "APPROVED" | "REJECTED") => {
    if (deciding.current || loading || !item.canDecide || !isPending(item.status)) return;
    deciding.current = true;
    setBusy(itemKey(item)); setError("");
    try {
      const response = await fetch(`/api/${item.review ? "reviews" : "approvals"}/${item.id}/decision`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.review ? { status, comment: comments[itemKey(item)]?.trim() || "" } : { status }) });
      if (!response.ok) throw new Error(await responseMessage(response, t.error));
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { deciding.current = false; setBusy(""); }
  };
  const visible = useMemo(() => items.filter((item) => filter === "ALL" || (filter === "PENDING" ? isPending(item.status) : item.status === filter)), [items, filter]);
  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => { const status = isPending(item.status) ? "PENDING" : item.status; result[status] = (result[status] || 0) + 1; return result; }, {}), [items]);
  const totalPages = Math.max(1, Math.ceil(visible.length / 20));
  const currentPage = Math.min(page, totalPages);
  const pageItems = visible.slice((currentPage - 1) * 20, currentPage * 20);
  useEffect(() => {
    let frame = 0;
    const followHash = () => {
      const id = window.location.hash.slice(1);
      const index = items.findIndex((item) => itemKey(item) === id);
      if (index < 0) return;
      setFilter("ALL"); setPage(Math.floor(index / 20) + 1);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => window.document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => { window.removeEventListener("hashchange", followHash); window.cancelAnimationFrame(frame); };
  }, [items]);
  useEffect(() => {
    if (!loading) window.document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loading, currentPage]);
  const statusLabel = (status: string) => isPending(status) ? t.pending : status === "APPROVED" ? t.approved : status === "REJECTED" ? t.rejected : status.replace(/_/gu, " ");
  const years = useMemo(() => Array.from({ length: new Date().getFullYear() - 2019 }, (_, index) => String(new Date().getFullYear() - index)), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: new Intl.DateTimeFormat(translate(locale, "fr-FR", "en-GB"), { month: "long" }).format(new Date(2026, index, 1)) })), [locale]);
  return <main className="approvals-shell"><section className="approvals-panel">
    <div className="approvals-heading"><div><span className="approvals-eyebrow">ISMS Portal</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><a href="/">{t.portal}</a></div>
    <div className="approval-summary" aria-label={t.title}>{(["PENDING", "APPROVED", "REJECTED"] as const).map((status) => <button key={status} type="button" className={filter === status ? "selected" : ""} aria-pressed={filter === status} onClick={() => changeFilter(status)}><span>{statusLabel(status)}</span><strong>{counts[status] || 0}</strong></button>)}</div>
    <div className="approval-toolbar"><div className="approval-period"><label>{t.period}<select disabled={!!busy} value={year} aria-label={t.year} onChange={(e) => setYear(e.target.value)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>{t.month}<select disabled={!!busy} value={month} onChange={(e) => setMonth(e.target.value)}><option value="ALL">{t.allMonths}</option>{months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div><label>{t.status}<select value={filter} onChange={(e) => changeFilter(e.target.value)}><option value="ALL">{t.all}</option><option value="PENDING">{t.pending}</option><option value="APPROVED">{t.approved}</option><option value="REJECTED">{t.rejected}</option></select></label><button type="button" title={t.refresh} aria-label={t.refresh} disabled={!!busy || loading} onClick={() => void reload()}><Icon name="sync" /></button></div></div>
    <p className="approval-result-count" role="status">{visible.length} {t.requests}</p>
    {error && <p className="admin-alert error" role="alert">{error}</p>}
    {loading ? <p role="status">{t.loading}</p> : <section className="approvals-list">
      {!visible.length && <p className="approvals-empty">{t.none}</p>}
      {pageItems.map((item) => <article className="approval-card" key={itemKey(item)} id={itemKey(item)}>
        <div><strong>{item.operation.replace(/_/gu, " ")}</strong><span className={`approval-status ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></div>
        <span className="approval-target">{item.targetType}: {item.targetId}</span><p>{item.reason}</p>
        <dl className="approval-details"><div><dt>{t.requested}</dt><dd>{item.requestedBy}</dd></div><div><dt>{item.review ? t.due : t.history}</dt><dd>{date(item.review && item.dueAt ? item.dueAt : item.createdAt)}</dd></div>{item.review && <><div><dt>{t.reviewer}</dt><dd>{item.reviewer || "-"}</dd></div><div><dt>{t.approver}</dt><dd>{item.approver || "-"}</dd></div></>}</dl>
        {item.approvedBy && <p className="approval-decision"><strong>{t.decided}:</strong> {item.approvedBy}{item.approvedAt && ` · ${date(item.approvedAt)}`}</p>}
        {isPending(item.status) && item.dueAt && new Date(item.dueAt).getTime() < Date.now() && <p className="approval-overdue">{translate(locale, "En retard", "Overdue")}</p>}
        {item.slug && <p><a className="approval-document-link" href={`/documents/${encodeURIComponent(item.slug)}`}>{t.open}</a></p>}
        {["PENDING", "IN_REVIEW"].includes(item.status) && item.canDecide && <>
          <p className="approval-action-note">{t.pendingAction}</p>{item.review && <label>{t.comment}<textarea disabled={!!busy} placeholder={t.commentHint} maxLength={1000} value={comments[itemKey(item)] || ""} onChange={(e) => setComments((current) => ({ ...current, [itemKey(item)]: e.target.value }))} /></label>}
          <div className="button-row"><button type="button" disabled={!!busy || !!item.review && (comments[itemKey(item)]?.trim().length || 0) < 3} onClick={() => { if (window.confirm(t.confirmApprove)) void decide(item, "APPROVED"); }}><Icon name="check" /> {t.approve}</button><button type="button" className="danger" disabled={!!busy || !!item.review && (comments[itemKey(item)]?.trim().length || 0) < 3} onClick={() => { if (window.confirm(t.confirmReject)) void decide(item, "REJECTED"); }}><Icon name="close" /> {t.reject}</button></div>
        </>}
        {["PENDING", "IN_REVIEW"].includes(item.status) && !item.canDecide && <p className="approval-readonly">{t.cannotDecide}</p>}
      </article>)}
    </section>}
    {!loading && totalPages > 1 && <nav className="document-pagination" aria-label={translate(locale, "Pagination des demandes", "Request pagination")}><button type="button" disabled={!!busy || currentPage === 1} onClick={() => setPage(currentPage - 1)}>{translate(locale, "Précédent", "Previous")}</button><span aria-live="polite">{currentPage} / {totalPages}</span><button type="button" disabled={!!busy || currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>{translate(locale, "Suivant", "Next")}</button></nav>}
  </section></main>;
}
