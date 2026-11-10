"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

type Share = {
  id: string;
  recipient: string;
  recipientType?: "user" | "group";
  createdBy: string;
  expiresAt: string | null;
  state: "active" | "expired" | "revoked";
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    throw new Error(
      [body?.message].flat().filter(Boolean).join(" ") ||
        `HTTP ${response.status}`,
    );
  }
  return response.json() as Promise<T>;
}

// Lets a designated depositor share a sensitive document with named people.
export function SensitiveShare({
  documentId,
  locale,
  showUnavailable = false,
}: {
  documentId: string;
  locale: Locale;
  showUnavailable?: boolean;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [allowed, setAllowed] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [duration, setDuration] = useState("7d");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [recipientType, setRecipientType] = useState<"user" | "group">("user");
  const [preview, setPreview] = useState<{
    key: string;
    recipient: string;
    emailCount: number;
    recipients: string[];
    expiresAt: string | null;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<
    Array<{ displayName: string; email: string }>
  >([]);

  useEffect(() => {
    const term = recipient.trim();
    if (!allowed || term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      request<Array<{ displayName?: string; email?: string; name?: string }>>(
        `/api/sensitive/directory-${recipientType === "group" ? "groups" : "users"}?q=${encodeURIComponent(term)}`,
        { cache: "no-store" },
      )
        .then(
          (entries) =>
            !cancelled &&
            setSuggestions(
              entries.map((entry) => ({
                displayName: entry.displayName || entry.name || "",
                email: entry.email || entry.name || "",
              })),
            ),
        )
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setMessage(
              translate(
                locale,
                "Recherche AD indisponible. Réessayez.",
                "AD search unavailable. Please retry.",
              ),
            );
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [recipient, allowed, recipientType, locale]);

  const load = useCallback(async () => {
    try {
      setShares(
        await request<Share[]>(
          `/api/sensitive/documents/${encodeURIComponent(documentId)}/shares`,
          { cache: "no-store" },
        ),
      );
    } catch (failure) {
      setShares([]);
      setMessage((failure as Error).message);
    }
  }, [documentId]);
  useEffect(() => {
    void request<{ depositor: boolean }>("/api/sensitive/me", {
      cache: "no-store",
    })
      .then((result) => {
        setAllowed(result.depositor);
        if (result.depositor) void load();
      })
      .catch(() => setAllowed(false));
  }, [load]);
  if (!allowed)
    return showUnavailable ? (
      <p>
        {t(
          "Le partage est réservé aux utilisateurs désignés dans Documents sensibles par un administrateur.",
          "Sharing is limited to users designated by an administrator in Sensitive documents.",
        )}
      </p>
    ) : null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const custom = String(data.get("expiresAt") || "");
    setBusy(true);
    setMessage("");
    try {
      const body = JSON.stringify({
        recipient: data.get("recipient"),
        recipientType,
        duration,
        ...(duration === "custom"
          ? { expiresAt: new Date(custom).toISOString() }
          : {}),
      });
      const previewKey = `${documentId}:${body}`;
      if (recipientType === "group" && preview?.key !== previewKey) {
        const result = await request<Omit<NonNullable<typeof preview>, "key">>(
          `/api/sensitive/documents/${encodeURIComponent(documentId)}/share-preview`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );
        setPreview({ ...result, key: previewKey });
        return;
      }
      const result = await request<{ emailSent: boolean }>(
        `/api/sensitive/documents/${encodeURIComponent(documentId)}/shares`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      form.reset();
      setRecipient("");
      setPreview(null);
      setMessage(
        result.emailSent
          ? t("Partagé ; e-mail envoyé.", "Shared; email sent.")
          : t(
              "Partagé ; aucun e-mail n’a pu être envoyé.",
              "Shared; no email could be sent.",
            ),
      );
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    try {
      await request(`/api/sensitive/shares/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="sensitive-share">
      <summary>
        {t("Partager ce document sensible", "Share this sensitive document")}
      </summary>
      <form className="admin-form" onSubmit={(event) => void submit(event)}>
        <label>
          {t("Type de destinataire", "Recipient type")}
          <select
            value={recipientType}
            disabled={busy}
            onChange={(event) => {
              setPreview(null);
              setRecipientType(event.target.value as "user" | "group");
              setRecipient("");
              setSuggestions([]);
              setMessage("");
            }}
          >
            <option value="user">
              {t("Utilisateur / e-mail", "User / email")}
            </option>
            <option value="group">
              {t("Groupe Active Directory", "Active Directory group")}
            </option>
          </select>
        </label>
        <label>
          {recipientType === "group"
            ? t("Nom du groupe AD", "AD group name")
            : t(
                "Identifiant ou e-mail du destinataire",
                "Recipient sign-in name or email",
              )}
          <input
            name="recipient"
            disabled={busy}
            required
            minLength={3}
            maxLength={254}
            autoComplete="off"
            list="sensitive-recipient-suggestions"
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value);
              setPreview(null);
            }}
          />
          <datalist id="sensitive-recipient-suggestions">
            {suggestions.map((user) => (
              <option key={user.email} value={user.email}>
                {user.displayName}
              </option>
            ))}
          </datalist>
        </label>
        <small>
          {recipientType === "group"
            ? t(
                "Seuls les membres authentifiés du groupe sélectionné pourront lire le document pendant la durée choisie.",
                "Only authenticated members of the selected group can read the document during the chosen period.",
              )
            : t(
                "Saisissez un nom ou un e-mail pour rechercher dans l’AD, ou renseignez directement l’e-mail du compte ISMS.",
                "Enter a name or email to search AD, or enter the ISMS account email directly.",
              )}
        </small>
        <label>
          {t("Durée d’accès", "Access duration")}
          <select
            value={duration}
            disabled={busy}
            onChange={(event) => {
              setDuration(event.target.value);
              setPreview(null);
            }}
          >
            <option value="24h">{t("24 heures", "24 hours")}</option>
            <option value="7d">{t("7 jours", "7 days")}</option>
            <option value="30d">{t("30 jours", "30 days")}</option>
            <option value="90d">{t("90 jours", "90 days")}</option>
            <option value="custom">{t("Date précise", "Specific date")}</option>
            <option value="lifetime">{t("À vie", "Lifetime")}</option>
          </select>
        </label>
        {duration === "custom" && (
          <label>
            {t("Expire le", "Expires on")}
            <input
              name="expiresAt"
              type="datetime-local"
              disabled={busy}
              required
              onChange={() => setPreview(null)}
            />
          </label>
        )}
        <button className="primary" disabled={busy}>
          {recipientType === "group"
            ? preview?.key.startsWith(`${documentId}:`)
              ? t("Confirmer le partage", "Confirm sharing")
              : t("Prévisualiser les destinataires", "Preview recipients")
            : t("Partager", "Share")}
        </button>
        {recipientType === "group" &&
          preview?.key.startsWith(`${documentId}:`) && (
            <div role="status">
              <strong>
                {preview.recipient} — {preview.emailCount}{" "}
                {t("destinataires e-mail", "email recipients")}
              </strong>
              <p>
                {t(
                  "Aucun partage ni e-mail n’a encore été créé. Les droits restent liés à l’appartenance au groupe ; la liste peut évoluer. Aperçu limité à 10 adresses.",
                  "No share or email has been created yet. Access remains tied to group membership; the list may change. Preview limited to 10 addresses.",
                )}
              </p>
              <ul>
                {preview.recipients.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
              <p>
                {preview.expiresAt
                  ? new Date(preview.expiresAt).toLocaleString(locale)
                  : t("À vie", "Lifetime")}
              </p>
            </div>
          )}
      </form>
      {message && <p role="status">{message}</p>}
      <ul className="plain-list">
        {shares.map((share) => (
          <li key={share.id}>
            {share.recipientType === "group" &&
              `${t("Groupe AD", "AD group")}: `}
            {share.recipient} —{" "}
            {share.expiresAt
              ? new Date(share.expiresAt).toLocaleString(locale)
              : t("À vie", "Lifetime")}{" "}
            <small>
              (
              {share.state === "active"
                ? t("actif", "active")
                : share.state === "expired"
                  ? t("expiré", "expired")
                  : t("révoqué", "revoked")}
              )
            </small>{" "}
            {share.state === "active" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke(share.id)}
              >
                {t("Révoquer", "Revoke")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
