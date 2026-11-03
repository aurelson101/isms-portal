"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { responseMessage } from "./request-errors";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

type Version = {
  id: string;
  locale: string;
  version: number;
  label: string;
  clean: boolean;
  purged: boolean;
};
type SignatureRequest = {
  id: string;
  status: "OPEN" | "COMPLETED" | "DECLINED" | "CANCELLED";
  requestedBy: string;
  message: string | null;
  createdAt: string;
  version: string | null;
  canCancel: boolean;
  entries: Array<{
    signer: string;
    status: "PENDING" | "SIGNED" | "DECLINED";
    decidedAt: string | null;
    comment: string | null;
    timestamped: boolean;
    canDecide: boolean;
  }>;
};
type Shares = {
  enabled: boolean;
  maxDays: number;
  canShare: boolean;
  reason: "disabled" | "not-published" | "sensitive" | null;
  links: Array<{
    id: string;
    createdBy: string;
    createdAt: string;
    expiresAt: string;
    maxDownloads: number | null;
    downloadCount: number;
    revokedAt: string | null;
    active: boolean;
  }>;
};

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!response.ok)
    throw new Error(await responseMessage(response, response.statusText));
  return response.json() as Promise<T>;
}

export function DocumentSignShare({
  documentId,
  locale,
  canEdit,
  versions,
}: {
  documentId: string;
  locale: Locale;
  canEdit: boolean;
  versions: Version[];
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const base = `/api/documents/${encodeURIComponent(documentId)}`;
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [shares, setShares] = useState<Shares | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signers, setSigners] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(7);
  const [maxDownloads, setMaxDownloads] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  // Signatures and links always target the latest clean version of a language.
  const latestVersions = useMemo(() => {
    const latest = new Map<string, Version>();
    for (const version of versions)
      if (
        version.clean &&
        !version.purged &&
        (latest.get(version.locale)?.version ?? 0) < version.version
      )
        latest.set(version.locale, version);
    return [...latest.values()];
  }, [versions]);
  const [versionId, setVersionId] = useState("");
  const selectedVersion = versionId || latestVersions[0]?.id || "";

  const load = useCallback(async () => {
    try {
      const [signatureList, shareState] = await Promise.all([
        call<SignatureRequest[]>(`${base}/signatures`, { cache: "no-store" }),
        canEdit
          ? call<Shares>(`${base}/shares`, { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      setRequests(signatureList);
      setShares(shareState);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [base, canEdit]);
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
  const date = (value: string) =>
    new Date(value).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
    });
  const statusLabel = (status: string) =>
    ({
      OPEN: t("En cours", "In progress"),
      COMPLETED: t("Terminée", "Completed"),
      DECLINED: t("Refusée", "Declined"),
      CANCELLED: t("Annulée", "Cancelled"),
      PENDING: t("En attente", "Pending"),
      SIGNED: t("Signé", "Signed"),
    })[status] || status;
  const versionSelect = (
    <select
      value={selectedVersion}
      aria-label={t("Version", "Version")}
      onChange={(event) => setVersionId(event.target.value)}
    >
      {latestVersions.map((version) => (
        <option key={version.id} value={version.id}>
          {version.locale.toUpperCase()} v{version.label}
        </option>
      ))}
    </select>
  );
  const pending = requests.some((request) =>
    request.entries.some((entry) => entry.canDecide),
  );

  return (
    <>
      {error && (
        <p className="error-state" role="alert">
          {error}
        </p>
      )}
      {(requests.length > 0 || canEdit) && (
        <details open={pending}>
          <summary>
            {t("Signatures électroniques", "Electronic signatures")} (
            {requests.length})
          </summary>
          <ul className="document-ged-list">
            {requests.map((request) => (
              <li key={request.id} className="document-ged-comment">
                <strong>
                  {request.version} · {statusLabel(request.status)}
                </strong>{" "}
                <small>
                  {t("demandée par", "requested by")} {request.requestedBy} ·{" "}
                  {date(request.createdAt)}
                </small>
                {request.message && <p>{request.message}</p>}
                <ul className="document-ged-list">
                  {request.entries.map((entry) => (
                    <li key={entry.signer}>
                      <span className="document-ged-tag">
                        {statusLabel(entry.status)}
                      </span>{" "}
                      {entry.signer}
                      {entry.decidedAt ? ` · ${date(entry.decidedAt)}` : ""}
                      {entry.timestamped
                        ? ` · ${t("horodaté", "time-stamped")}`
                        : ""}
                      {entry.canDecide && (
                        <span className="document-ged-actions">
                          <button
                            type="button"
                            className="primary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  t(
                                    "Je confirme signer électroniquement cette version du document, dont j’ai pris connaissance.",
                                    "I confirm that I electronically sign this version of the document, which I have read.",
                                  ),
                                )
                              )
                                return;
                              void run(() =>
                                call(
                                  `${base}/signatures/${request.id}/decision`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      decision: "SIGN",
                                      consent: true,
                                    }),
                                  },
                                ),
                              );
                            }}
                          >
                            {t("Signer", "Sign")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const comment = window.prompt(
                                t("Motif du refus", "Reason for declining"),
                              );
                              if (comment === null) return;
                              void run(() =>
                                call(
                                  `${base}/signatures/${request.id}/decision`,
                                  {
                                    method: "POST",
                                    body: JSON.stringify({
                                      decision: "DECLINE",
                                      consent: false,
                                      comment,
                                    }),
                                  },
                                ),
                              );
                            }}
                          >
                            {t("Refuser", "Decline")}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="document-ged-actions">
                  <a href={`${base}/signatures/${request.id}/certificate`}>
                    {t(
                      "Certificat de signature (PDF)",
                      "Signature certificate (PDF)",
                    )}
                  </a>
                  {request.canCancel && (
                    <button
                      type="button"
                      className="document-ged-link"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          call(`${base}/signatures/${request.id}`, {
                            method: "DELETE",
                          }),
                        )
                      }
                    >
                      {t("Annuler la demande", "Cancel request")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {canEdit && latestVersions.length > 0 && (
            <form
              className="document-ged-form"
              onSubmit={(event) => {
                event.preventDefault();
                const list = signers
                  .split(/[\s,;]+/u)
                  .map((item) => item.trim())
                  .filter(Boolean);
                if (!list.length) return;
                void run(async () => {
                  await call(`${base}/signatures`, {
                    method: "POST",
                    body: JSON.stringify({
                      versionId: selectedVersion,
                      signers: list,
                      ...(message.trim() ? { message: message.trim() } : {}),
                    }),
                  });
                  setSigners("");
                  setMessage("");
                });
              }}
            >
              {versionSelect}
              <input
                value={signers}
                aria-label={t("Signataires", "Signers")}
                placeholder={t(
                  "E-mails des signataires, séparés par des virgules",
                  "Signer e-mails, comma-separated",
                )}
                onChange={(event) => setSigners(event.target.value)}
              />
              <input
                value={message}
                maxLength={1000}
                aria-label={t("Message (facultatif)", "Message (optional)")}
                placeholder={t("Message (facultatif)", "Message (optional)")}
                onChange={(event) => setMessage(event.target.value)}
              />
              <button type="submit" disabled={busy || !signers.trim()}>
                {t("Demander les signatures", "Request signatures")}
              </button>
            </form>
          )}
        </details>
      )}

      {canEdit && shares && (
        <details>
          <summary>
            {t("Partage externe", "External sharing")} (
            {shares.links.filter((link) => link.active).length})
          </summary>
          {!shares.canShare && (
            <p>
              {shares.reason === "disabled"
                ? t(
                    "Le partage externe est désactivé par l’administrateur.",
                    "External sharing is disabled by the administrator.",
                  )
                : shares.reason === "sensitive"
                  ? t(
                      "Les documents sensibles ne peuvent pas être partagés à l’extérieur.",
                      "Sensitive documents cannot be shared externally.",
                    )
                  : shares.reason === "not-published"
                    ? t(
                        "Seuls les documents publiés peuvent être partagés.",
                        "Only published documents can be shared.",
                      )
                    : t(
                        "Vous n’avez pas le droit de partager ce document.",
                        "You are not allowed to share this document.",
                      )}
            </p>
          )}
          {shares.canShare && latestVersions.length > 0 && (
            <form
              className="document-ged-form"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const created = await call<{ url: string }>(
                    `${base}/shares`,
                    {
                      method: "POST",
                      body: JSON.stringify({
                        versionId: selectedVersion,
                        expiresInDays: days,
                        ...(Number(maxDownloads) > 0
                          ? { maxDownloads: Number(maxDownloads) }
                          : {}),
                      }),
                    },
                  );
                  setCreatedUrl(`${window.location.origin}${created.url}`);
                });
              }}
            >
              {versionSelect}
              <label>
                {t("Durée (jours)", "Duration (days)")}
                <input
                  type="number"
                  min={1}
                  max={shares.maxDays}
                  value={days}
                  onChange={(event) =>
                    setDays(
                      Math.min(
                        shares.maxDays,
                        Math.max(1, Number(event.target.value) || 1),
                      ),
                    )
                  }
                />
              </label>
              <label>
                {t("Téléchargements max.", "Max. downloads")}
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxDownloads}
                  placeholder={t("illimité", "unlimited")}
                  onChange={(event) => setMaxDownloads(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                {t("Créer le lien", "Create link")}
              </button>
            </form>
          )}
          {createdUrl && (
            <div className="document-ged-actions" role="status">
              <input
                readOnly
                value={createdUrl}
                aria-label={t("Lien de partage", "Share link")}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(createdUrl)}
              >
                {t("Copier", "Copy")}
              </button>
              <small>
                {t(
                  "Ce lien n’est affiché qu’une seule fois.",
                  "This link is shown only once.",
                )}
              </small>
            </div>
          )}
          <ul className="document-ged-list">
            {shares.links.map((link) => (
              <li key={link.id}>
                <span className="document-ged-tag">
                  {link.active
                    ? t("Actif", "Active")
                    : link.revokedAt
                      ? t("Révoqué", "Revoked")
                      : t("Expiré", "Expired")}
                </span>{" "}
                {link.createdBy} · {t("expire le", "expires on")}{" "}
                {date(link.expiresAt)} · {link.downloadCount}
                {link.maxDownloads ? ` / ${link.maxDownloads}` : ""}{" "}
                {t("téléchargement(s)", "download(s)")}
                {link.active && (
                  <button
                    type="button"
                    className="document-ged-link"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        call(`${base}/shares/${link.id}`, { method: "DELETE" }),
                      )
                    }
                  >
                    {t("Révoquer", "Revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
