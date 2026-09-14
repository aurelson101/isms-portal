"use client";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import "./approvals.css";

type Item = { id: string; operation: string; targetType: string; targetId: string; requestedBy: string; reason: string; status: string; approvedBy: string | null; approvedAt: string | null; createdAt: string; review?: boolean; canDecide?: boolean; slug?: string };
type Review = { id: string; owner: string; status: string; decidedBy: string | null; decidedAt: string | null; createdAt: string; decisionComment: string | null; canDecide: boolean; document: { slug: string; translations: Array<{ title: string; locale: string }> } };
const date = (value: string) => new Date(value).toLocaleString("en-GB");

export default function ApprovalsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("ALL");
  const reload = useCallback(async () => {
    const [approvals, reviews] = await Promise.all([fetch("/api/approvals", { cache: "no-store" }), fetch("/api/reviews", { cache: "no-store" })]);
    if (!reviews.ok) throw new Error("Unable to load reviews. Please sign in to the portal.");
    if (!approvals.ok && approvals.status !== 403) throw new Error("Unable to load approvals.");
    const sensitive = approvals.ok ? await approvals.json() as Item[] : [];
    const assigned = await reviews.json() as Review[];
    setItems([...sensitive, ...assigned.map((r) => ({ id: r.id, operation: "Document review", targetType: "Document", targetId: r.document.translations.find((t) => t.locale === "en")?.title || r.document.translations[0]?.title || r.document.slug, requestedBy: r.owner, reason: r.decisionComment || "Review the document and record your decision.", status: r.status, approvedBy: r.decidedBy, approvedAt: r.decidedAt, createdAt: r.createdAt, review: true, canDecide: r.canDecide, slug: r.document.slug }))]);
  }, []);
  useEffect(() => { void reload().catch((e: Error) => setError(e.message)).finally(() => setLoading(false)); }, [reload]);
  const decide = async (item: Item, status: "APPROVED" | "REJECTED") => {
    setBusy(item.id); setError("");
    try {
      const response = await fetch(`/api/${item.review ? "reviews" : "approvals"}/${item.id}/decision`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.review ? { status, comment: comments[item.id]?.trim() || "" } : { status }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(Array.isArray(body.message) ? body.message.join(". ") : body.message || "Unable to record this decision."); }
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(""); }
  };
  return <main className="approvals-shell"><section className="approvals-panel">
    <div className="approvals-heading"><div><h1>Approvals and Reviews</h1><p>ISMS Portal</p></div><a href="/">Back to portal</a></div>
    <div className="approval-toolbar"><label>Status <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><button type="button" title="Refresh" aria-label="Refresh" disabled={!!busy} onClick={() => void reload().catch((e: Error) => setError(e.message))}><Icon name="sync" /></button></div>
    {error && <p className="admin-alert error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading...</p> : <section className="approvals-list">
      {!items.filter((item) => filter === "ALL" || item.status === filter).length && <p>No matching requests.</p>}
      {items.filter((item) => filter === "ALL" || item.status === filter).map((item) => <article className="approval-card" key={item.id} id={item.id}>
        <div><strong>{item.operation.replace(/_/gu, " ")}</strong><span className={`approval-status ${item.status.toLowerCase()}`}>{item.status.replace(/_/gu, " ")}</span></div>
        <span className="approval-target">{item.targetType}: {item.targetId}</span><p>{item.reason}</p>
        <small>Requested by {item.requestedBy} on {date(item.createdAt)}</small>
        {item.approvedBy && <small>{item.status} by {item.approvedBy}{item.approvedAt && ` on ${date(item.approvedAt)}`}</small>}
        {item.slug && <p><a href={`/documents/${encodeURIComponent(item.slug)}`}>Open document</a></p>}
        {["PENDING", "IN_REVIEW"].includes(item.status) && item.canDecide && <>
          {item.review && <label>Decision comment<textarea maxLength={1000} value={comments[item.id] || ""} onChange={(e) => setComments({ ...comments, [item.id]: e.target.value })} /></label>}
          <div className="button-row"><button type="button" disabled={!!busy || !!item.review && (comments[item.id]?.trim().length || 0) < 3} onClick={() => void decide(item, "APPROVED")}><Icon name="check" /> Approve</button><button type="button" className="danger" disabled={!!busy || !!item.review && (comments[item.id]?.trim().length || 0) < 3} onClick={() => void decide(item, "REJECTED")}><Icon name="close" /> Reject</button></div>
        </>}
      </article>)}
    </section>}
  </section></main>;
}
