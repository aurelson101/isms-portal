"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "./api-client";
import { translate } from "../i18n/translate";
import type { Locale } from "../i18n/locale";

type Depositor = {
  id: string;
  identity: string;
  displayName: string | null;
  addedBy: string;
  createdAt: string;
};
type Share = {
  id: string;
  recipient: string;
  createdBy: string;
  expiresAt: string | null;
  documentId: string;
  title: string;
};

const formatDate = (value: string | null, locale: Locale) =>
  value
    ? new Date(value).toLocaleString(locale)
    : translate(locale, "À vie", "Lifetime");

export function SensitivePanel({
  locale,
  onError,
  onNotice,
}: {
  locale: Locale;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [depositors, setDepositors] = useState<Depositor[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [people, active] = await Promise.all([
        api<Depositor[]>("/api/admin/sensitive/depositors", {
          cache: "no-store",
        }),
        api<Share[]>("/api/admin/sensitive/shares", { cache: "no-store" }),
      ]);
      setDepositors(people);
      setShares(active);
    } catch (error) {
      onError((error as Error).message);
    }
  }, [onError]);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      const result = await api<{ emailSent: boolean }>(
        "/api/admin/sensitive/depositors",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identity: data.get("identity"),
            displayName: data.get("displayName") || undefined,
          }),
        },
      );
      form.reset();
      onNotice(
        result.emailSent
          ? t(
              "Utilisateur ajouté et e-mail envoyé.",
              "User added and email sent.",
            )
          : t(
              "Utilisateur ajouté ; aucun e-mail n’a pu être envoyé.",
              "User added; no email could be sent.",
            ),
      );
      await load();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (path: string) => {
    setBusy(true);
    try {
      await api(path, { method: "DELETE" });
      await load();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-section">
      <h1>{t("Documents sensibles", "Sensitive documents")}</h1>
      <p>
        {t(
          "Seuls les utilisateurs listés ici peuvent créer un document sensible et le partager nominativement, pour une durée choisie ou à vie.",
          "Only the users listed here can create a sensitive document and share it with named people, for a chosen period or for life.",
        )}
      </p>
      <form className="admin-form" onSubmit={(event) => void add(event)}>
        <label>
          {t("Identifiant ou e-mail", "Sign-in name or email")}
          <input name="identity" required minLength={3} maxLength={254} />
        </label>
        <label>
          {t("Nom affiché (facultatif)", "Display name (optional)")}
          <input name="displayName" maxLength={160} />
        </label>
        <div className="button-row">
          <button className="primary" disabled={busy}>
            {t("Ajouter et notifier par e-mail", "Add and notify by email")}
          </button>
        </div>
      </form>
      <h2>{t("Utilisateurs autorisés", "Authorised users")}</h2>
      {depositors.length === 0 ? (
        <p>{t("Aucun utilisateur désigné.", "No user designated.")}</p>
      ) : (
        <ul className="plain-list">
          {depositors.map((item) => (
            <li key={item.id}>
              <strong>{item.displayName || item.identity}</strong>{" "}
              <small>
                {item.identity} — {t("ajouté par", "added by")} {item.addedBy}
              </small>{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void remove(`/api/admin/sensitive/depositors/${item.id}`)
                }
              >
                {t("Retirer", "Remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h2>{t("Partages actifs", "Active shares")}</h2>
      {shares.length === 0 ? (
        <p>{t("Aucun partage actif.", "No active share.")}</p>
      ) : (
        <ul className="plain-list">
          {shares.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong> → {item.recipient}{" "}
              <small>
                {t("par", "by")} {item.createdBy} — {t("expire", "expires")}:{" "}
                {formatDate(item.expiresAt, locale)}
              </small>{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void remove(`/api/admin/sensitive/shares/${item.id}`)
                }
              >
                {t("Révoquer", "Revoke")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
