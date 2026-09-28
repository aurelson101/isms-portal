"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../icons";
import "./approvals.css";

type Item = { id: string; operation: string; targetType: string; targetId: string; requestedBy: string; reason: string; status: string; approvedBy: string | null; approvedAt: string | null; createdAt: string; review?: boolean; canDecide?: boolean; slug?: string; dueAt?: string; reviewer?: string; approver?: string };
type Review = { id: string; owner: string; reviewer: string; approver: string; dueAt: string; status: string; decidedBy: string | null; decidedAt: string | null; createdAt: string; decisionComment: string | null; canDecide: boolean; document: { slug: string; translations: Array<{ title: string; locale: string }> } };
const copy = {
  fr: { title: "Approbations et revues", subtitle: "Décidez, suivez et retrouvez l'historique des demandes.", portal: "Retour au portail", status: "État", period: "Période", year: "Année", month: "Mois", allMonths: "Toute l'année", all: "Toutes", pending: "À traiter", approved: "Approuvées", rejected: "Refusées", refresh: "Actualiser", requests: "demandes", none: "Aucune demande correspondante.", document: "Document", operation: "Opération", requested: "Demandé par", due: "Échéance", reviewer: "Relecteur", approver: "Approbateur", comment: "Commentaire de décision", commentHint: "Ajoutez un commentaire pour expliquer la décision.", open: "Ouvrir le document", approve: "Approuver", reject: "Refuser", decided: "Décision par", history: "Historique", pendingAction: "Votre décision est requise.", cannotDecide: "Consultation uniquement", review: "Revue documentaire", loading: "Chargement des demandes…", error: "Impossible de charger les demandes. Connectez-vous au portail puis réessayez.", confirmApprove: "Confirmer l'approbation de cette demande ?", confirmReject: "Confirmer le refus de cette demande ?" },
  en: { title: "Approvals and Reviews", subtitle: "Decide, track and review the history of requests.", portal: "Back to portal", status: "Status", period: "Period", year: "Year", month: "Month", allMonths: "Full year", all: "All", pending: "Action required", approved: "Approved", rejected: "Rejected", refresh: "Refresh", requests: "requests", none: "No matching requests.", document: "Document", operation: "Operation", requested: "Requested by", due: "Due date", reviewer: "Reviewer", approver: "Approver", comment: "Decision comment", commentHint: "Add a comment explaining the decision.", open: "Open document", approve: "Approve", reject: "Reject", decided: "Decision by", history: "History", pendingAction: "Your decision is required.", cannotDecide: "Read-only", review: "Document review", loading: "Loading requests…", error: "Unable to load requests. Sign in to the portal and try again.", confirmApprove: "Approve this request?", confirmReject: "Reject this request?" },
};

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("ALL");
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const [month, setMonth] = useState("ALL");
  const locale = typeof window !== "undefined" && localStorage.getItem("isms-locale") === "fr" ? "fr" : "en";
  const t = copy[locale];
  const date = (value: string) => new Date(value).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB");
  const reload = useCallback(async () => {
    const query = new URLSearchParams({ year, ...(month === "ALL" ? {} : { month }) });
    const [approvals, reviews] = await Promise.all([fetch(`/api/approvals?${query}`, { cache: "no-store" }), fetch(`/api/reviews?${query}`, { cache: "no-store" })]);
    if (!reviews.ok) throw new Error(t.error);
    if (!approvals.ok && approvals.status !== 403) throw new Error(t.error);
    const sensitive = approvals.ok ? await approvals.json() as Item[] : [];
    const assigned = await reviews.json() as Review[];
    setItems([...sensitive, ...assigned.map((r) => ({ id: r.id, operation: t.review, targetType: t.document, targetId: r.document.translations.find((item) => item.locale === locale)?.title || r.document.translations.find((item) => item.locale === "en")?.title || r.document.translations[0]?.title || r.document.slug, requestedBy: r.owner, reason: r.decisionComment || (locale === "fr" ? "Examinez le document et enregistrez votre décision." : "Review the document and record your decision."), status: r.status, approvedBy: r.decidedBy, approvedAt: r.decidedAt, createdAt: r.createdAt, review: true, canDecide: r.canDecide, slug: r.document.slug, dueAt: r.dueAt, reviewer: r.reviewer, approver: r.approver }))]);
  }, [locale, month, t.error, t.review, t.document, year]);
  useEffect(() => { setLoading(true); void reload().catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, [reload]);
  const decide = async (item: Item, status: "APPROVED" | "REJECTED") => {
    setBusy(item.id); setError("");
    try {
      const response = await fetch(`/api/${item.review ? "reviews" : "approvals"}/${item.id}/decision`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.review ? { status, comment: comments[item.id]?.trim() || "" } : { status }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(Array.isArray(body.message) ? body.message.join(". ") : body.message || t.error); }
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(""); }
  };
  const visible = useMemo(() => items.filter((item) => filter === "ALL" || item.status === filter), [items, filter]);
  const count = (status: string) => items.filter((item) => status === "ALL" || item.status === status).length;
  const years = useMemo(() => Array.from({ length: new Date().getFullYear() - 2019 }, (_, index) => String(new Date().getFullYear() - index)), []);
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1), label: new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { month: "long" }).format(new Date(2026, index, 1)) })), [locale]);
  return <main className="approvals-shell"><section className="approvals-panel">
    <div className="approvals-heading"><div><span className="approvals-eyebrow">ISMS Portal</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><a href="/">{t.portal}</a></div>
    <div className="approval-summary" aria-label={t.title}><button className={filter === "PENDING" ? "selected" : ""} onClick={() => setFilter("PENDING")}><span>{t.pending}</span><strong>{count("PENDING") + count("IN_REVIEW")}</strong></button><button className={filter === "APPROVED" ? "selected" : ""} onClick={() => setFilter("APPROVED")}><span>{t.approved}</span><strong>{count("APPROVED")}</strong></button><button className={filter === "REJECTED" ? "selected" : ""} onClick={() => setFilter("REJECTED")}><span>{t.rejected}</span><strong>{count("REJECTED")}</strong></button></div>
    <div className="approval-toolbar"><div className="approval-period"><label>{t.period}<select value={year} aria-label={t.year} onChange={(e) => setYear(e.target.value)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>{t.month}<select value={month} onChange={(e) => setMonth(e.target.value)}><option value="ALL">{t.allMonths}</option>{months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><div><label>{t.status}<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">{t.all}</option><option value="PENDING">{t.pending}</option><option value="APPROVED">{t.approved}</option><option value="REJECTED">{t.rejected}</option></select></label><button type="button" title={t.refresh} aria-label={t.refresh} disabled={!!busy} onClick={() => void reload().catch((e: Error) => setError(e.message))}><Icon name="sync" /></button></div></div>
    {error && <p className="admin-alert error" role="alert">{error}</p>}
    {loading ? <p role="status">{t.loading}</p> : <section className="approvals-list">
      {!visible.length && <p className="approvals-empty">{t.none}</p>}
      {visible.map((item) => <article className="approval-card" key={item.id} id={`${item.review ? "review" : "approval"}-${item.id}`}>
        <div><strong>{item.operation.replace(/_/gu, " ")}</strong><span className={`approval-status ${item.status.toLowerCase()}`}>{item.status.replace(/_/gu, " ")}</span></div>
        <span className="approval-target">{item.targetType}: {item.targetId}</span><p>{item.reason}</p>
        <dl className="approval-details"><div><dt>{t.requested}</dt><dd>{item.requestedBy}</dd></div><div><dt>{item.review ? t.due : t.history}</dt><dd>{date(item.review && item.dueAt ? item.dueAt : item.createdAt)}</dd></div>{item.review && <><div><dt>{t.reviewer}</dt><dd>{item.reviewer || "-"}</dd></div><div><dt>{t.approver}</dt><dd>{item.approver || "-"}</dd></div></>}</dl>
        {item.approvedBy && <p className="approval-decision"><strong>{t.decided}:</strong> {item.approvedBy}{item.approvedAt && ` · ${date(item.approvedAt)}`}</p>}
        {item.slug && <p><a className="approval-document-link" href={`/documents/${encodeURIComponent(item.slug)}`}>{t.open}</a></p>}
        {["PENDING", "IN_REVIEW"].includes(item.status) && item.canDecide && <>
          <p className="approval-action-note">{t.pendingAction}</p>{item.review && <label>{t.comment}<textarea placeholder={t.commentHint} maxLength={1000} value={comments[item.id] || ""} onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })} /></label>}
          <div className="button-row"><button type="button" disabled={!!busy || !!item.review && (comments[item.id]?.trim().length || 0) < 3} onClick={() => { if (window.confirm(t.confirmApprove)) void decide(item, "APPROVED"); }}><Icon name="check" /> {t.approve}</button><button type="button" className="danger" disabled={!!busy || !!item.review && (comments[item.id]?.trim().length || 0) < 3} onClick={() => { if (window.confirm(t.confirmReject)) void decide(item, "REJECTED"); }}><Icon name="close" /> {t.reject}</button></div>
        </>}
        {["PENDING", "IN_REVIEW"].includes(item.status) && !item.canDecide && <p className="approval-readonly">{t.cannotDecide}</p>}
      </article>)}
    </section>}
  </section></main>;
}
