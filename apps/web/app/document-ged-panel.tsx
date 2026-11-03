"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { responseMessage } from "./request-errors";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";
import { DocumentSignShare } from "./document-sign-share";

type LinkType = "SUPERSEDES" | "ANNEX" | "RELATED";
type GedPanel = {
  subscribed: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  lock: {
    lockedBy: string;
    lockExpiresAt: string;
    mine: boolean;
  } | null;
  links: Array<{
    id: string;
    type: LinkType;
    direction: "outgoing" | "incoming";
    document: {
      id: string;
      slug: string;
      translations: Array<{ locale: string; title: string }>;
    };
  }>;
  comments: Array<{
    id: string;
    author: string;
    body: string;
    page: number | null;
    createdAt: string;
    canDelete: boolean;
  }>;
  versions: Array<{
    id: string;
    locale: string;
    version: number;
    label: string;
    createdAt: string;
    changeSummary: string | null;
    fileName: string;
    sha256: string;
    purged: boolean;
    clean: boolean;
    timestampedAt: string | null;
    indexed: string | null;
    ocr: boolean;
  }>;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  if (!response.ok)
    throw new Error(await responseMessage(response, response.statusText));
  return response.json() as Promise<T>;
}

export function DocumentGedPanel({
  documentId,
  locale,
  onVersionRestored,
}: {
  documentId: string;
  locale: Locale;
  onVersionRestored?: () => void;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [panel, setPanel] = useState<GedPanel | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [commentPage, setCommentPage] = useState("");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("RELATED");
  const base = `/api/documents/${encodeURIComponent(documentId)}`;

  const load = useCallback(async () => {
    try {
      setPanel(await request<GedPanel>(`${base}/ged`, { cache: "no-store" }));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const linkLabel = (type: LinkType, direction: "outgoing" | "incoming") =>
    type === "SUPERSEDES"
      ? direction === "outgoing"
        ? t("Remplace", "Supersedes")
        : t("Remplacé par", "Superseded by")
      : type === "ANNEX"
        ? direction === "outgoing"
          ? t("Annexe de", "Annex of")
          : t("A pour annexe", "Has annex")
        : t("Voir aussi", "See also");
  const date = (value: string) =>
    new Date(value).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  if (!panel)
    return error ? (
      <p className="error-state" role="alert">
        {error}
      </p>
    ) : null;
  const latest = new Map<string, number>();
  for (const version of panel.versions)
    latest.set(
      version.locale,
      Math.max(latest.get(version.locale) || 0, version.version),
    );

  return (
    <section
      className="document-ged-panel"
      aria-label={t("Gestion documentaire", "Document management")}
    >
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}
      <div className="document-ged-actions">
        <button
          type="button"
          disabled={busy}
          aria-pressed={panel.subscribed}
          onClick={() =>
            run(() =>
              request(`${base}/subscription`, {
                method: "PUT",
                body: JSON.stringify({ subscribed: !panel.subscribed }),
              }),
            )
          }
        >
          {panel.subscribed
            ? t("Ne plus suivre", "Unfollow")
            : t("Suivre ce document", "Follow this document")}
        </button>
        {panel.lock ? (
          <span className="document-ged-lock" role="status">
            {panel.lock.mine
              ? t("Réservé par vous jusqu’au", "Checked out by you until")
              : t("En cours de modification par", "Being edited by")}{" "}
            {panel.lock.mine ? "" : `${panel.lock.lockedBy} · `}
            {date(panel.lock.lockExpiresAt)}
          </span>
        ) : null}
        {panel.canEdit &&
          (!panel.lock || panel.lock.mine ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() => request(`${base}/lock`, { method: "POST" }))
              }
            >
              {panel.lock
                ? t("Prolonger la réservation", "Extend check-out")
                : t("Réserver pour modification", "Check out for editing")}
            </button>
          ) : null)}
        {panel.canEdit && panel.lock && (panel.lock.mine || panel.isAdmin) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() => request(`${base}/lock`, { method: "DELETE" }))
            }
          >
            {t("Libérer", "Release")}
          </button>
        )}
      </div>

      <details open={panel.links.length > 0}>
        <summary>
          {t("Documents liés", "Linked documents")} ({panel.links.length})
        </summary>
        {panel.links.length ? (
          <ul className="document-ged-list">
            {panel.links.map((link) => (
              <li key={`${link.direction}-${link.id}`}>
                <span className="document-ged-tag">
                  {linkLabel(link.type, link.direction)}
                </span>{" "}
                <a
                  href={`/documents/${encodeURIComponent(link.document.slug)}`}
                >
                  {link.document.translations.find(
                    (item) => item.locale === locale,
                  )?.title ||
                    link.document.translations[0]?.title ||
                    link.document.slug}
                </a>
                {panel.canEdit && link.direction === "outgoing" && (
                  <button
                    type="button"
                    className="document-ged-link"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        request(`${base}/links/${link.id}`, {
                          method: "DELETE",
                        }),
                      )
                    }
                  >
                    {t("Retirer", "Remove")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("Aucun document lié.", "No linked document.")}</p>
        )}
        {panel.canEdit && (
          <form
            className="document-ged-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!linkTarget.trim()) return;
              void run(async () => {
                await request(`${base}/links`, {
                  method: "POST",
                  body: JSON.stringify({ target: linkTarget, type: linkType }),
                });
                setLinkTarget("");
              });
            }}
          >
            <select
              value={linkType}
              aria-label={t("Type de lien", "Link type")}
              onChange={(event) => setLinkType(event.target.value as LinkType)}
            >
              <option value="RELATED">{t("Voir aussi", "See also")}</option>
              <option value="SUPERSEDES">{t("Remplace", "Supersedes")}</option>
              <option value="ANNEX">{t("Annexe de", "Annex of")}</option>
            </select>
            <input
              value={linkTarget}
              maxLength={500}
              aria-label={t("Document cible", "Target document")}
              placeholder={t(
                "Lien copié, référence ou identifiant",
                "Copied link, reference or identifier",
              )}
              onChange={(event) => setLinkTarget(event.target.value)}
            />
            <button type="submit" disabled={busy || !linkTarget.trim()}>
              {t("Lier", "Link")}
            </button>
          </form>
        )}
      </details>

      <details open={panel.comments.length > 0}>
        <summary>
          {t("Commentaires", "Comments")} ({panel.comments.length})
        </summary>
        <form
          className="document-ged-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!comment.trim()) return;
            void run(async () => {
              await request(`${base}/comments`, {
                method: "POST",
                body: JSON.stringify({
                  body: comment,
                  ...(Number(commentPage) > 0
                    ? { page: Number(commentPage) }
                    : {}),
                }),
              });
              setComment("");
              setCommentPage("");
            });
          }}
        >
          <textarea
            value={comment}
            maxLength={2000}
            rows={3}
            aria-label={t("Votre commentaire", "Your comment")}
            placeholder={t("Votre commentaire", "Your comment")}
            onChange={(event) => setComment(event.target.value)}
          />
          <input
            type="number"
            min={1}
            value={commentPage}
            aria-label={t("Page concernée (facultatif)", "Page (optional)")}
            placeholder={t("Page", "Page")}
            onChange={(event) => setCommentPage(event.target.value)}
          />
          <button type="submit" disabled={busy || !comment.trim()}>
            {t("Publier le commentaire", "Post comment")}
          </button>
        </form>
        <ul className="document-ged-list">
          {panel.comments.map((item) => (
            <li key={item.id} className="document-ged-comment">
              <strong>{item.author}</strong>{" "}
              <small>
                {date(item.createdAt)}
                {item.page ? ` · ${t("page", "page")} ${item.page}` : ""}
              </small>
              <p>{item.body}</p>
              {item.canDelete && (
                <button
                  type="button"
                  className="document-ged-link"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      request(`${base}/comments/${item.id}`, {
                        method: "DELETE",
                      }),
                    )
                  }
                >
                  {t("Supprimer", "Delete")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </details>

      {panel.canEdit && panel.versions.length > 0 && (
        <details>
          <summary>
            {t("Historique des versions", "Version history")} (
            {panel.versions.length})
          </summary>
          <div className="document-ged-table">
            <table className="document-ged-versions">
              <thead>
                <tr>
                  <th>{t("Version", "Version")}</th>
                  <th>{t("Date", "Date")}</th>
                  <th>{t("Résumé", "Summary")}</th>
                  <th>{t("Recherche", "Search")}</th>
                  <th>{t("Horodatage", "Time-stamp")}</th>
                  <th>
                    <span className="document-ged-sr">
                      {t("Actions", "Actions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {panel.versions.map((version) => (
                  <tr key={version.id}>
                    <td>
                      {version.locale.toUpperCase()} v{version.label}
                    </td>
                    <td>{date(version.createdAt)}</td>
                    <td>{version.changeSummary || "—"}</td>
                    <td>
                      {version.indexed === "DONE"
                        ? version.ocr
                          ? t("Indexé (OCR)", "Indexed (OCR)")
                          : t("Indexé", "Indexed")
                        : version.indexed === "FAILED"
                          ? t("Échec", "Failed")
                          : version.indexed === "SKIPPED"
                            ? t("Non indexable", "Not indexable")
                            : t("En attente", "Pending")}
                    </td>
                    <td>
                      {version.timestampedAt ? (
                        panel.isAdmin ? (
                          <a
                            href={`/api/admin/ged/versions/${version.id}/timestamp`}
                            title={version.sha256}
                          >
                            {date(version.timestampedAt)}
                          </a>
                        ) : (
                          date(version.timestampedAt)
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {version.version !== latest.get(version.locale) &&
                        version.clean &&
                        !version.purged && (
                          <button
                            type="button"
                            disabled={
                              busy || Boolean(panel.lock && !panel.lock.mine)
                            }
                            onClick={() => {
                              if (
                                !window.confirm(
                                  t(
                                    "Restaurer cette version ? Elle deviendra la nouvelle version courante, à republier.",
                                    "Restore this version? It becomes the new current version and must be published again.",
                                  ),
                                )
                              )
                                return;
                              void run(async () => {
                                await request(
                                  `${base}/versions/${version.id}/restore`,
                                  { method: "POST", body: "{}" },
                                );
                                onVersionRestored?.();
                              });
                            }}
                          >
                            {t("Restaurer", "Restore")}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <DocumentSignShare
        documentId={documentId}
        locale={locale}
        canEdit={panel.canEdit}
        versions={panel.versions}
      />
    </section>
  );
}
