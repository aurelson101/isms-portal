"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import { translate } from "../i18n/translate";
import type { Locale } from "../i18n/locale";

type TimestampSettings = {
  source: "settings" | "environment" | "none";
  enabled: boolean;
  url: string;
  username: string;
  policyOid: string;
  hasPassword: boolean;
};
type SharingSettings = { enabled: boolean; maxDays: number };

export function GedOptions({
  locale,
  onError,
  onNotice,
}: {
  locale: Locale;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [timestamp, setTimestamp] = useState<TimestampSettings | null>(null);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);
  const [sharing, setSharing] = useState<SharingSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api<TimestampSettings>("/api/admin/ged/timestamp"),
      api<SharingSettings>("/api/admin/ged/sharing"),
    ])
      .then(([timestampValue, sharingValue]) => {
        setTimestamp(timestampValue);
        setSharing(sharingValue);
      })
      .catch((error: Error) => onError(error.message));
  }, [onError]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!timestamp || !sharing) return null;

  return (
    <section className="admin-card">
      <h2>{t("Options GED", "GED options")}</h2>
      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const saved = await api<TimestampSettings>(
              "/api/admin/ged/timestamp",
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  enabled: timestamp.enabled,
                  url: timestamp.url.trim(),
                  username: timestamp.username.trim(),
                  policyOid: timestamp.policyOid.trim(),
                  ...(password ? { password } : {}),
                  ...(clearPassword ? { clearPassword: true } : {}),
                }),
              },
            );
            setTimestamp(saved);
            setPassword("");
            setClearPassword(false);
            onNotice(t("Horodatage enregistré.", "Time-stamping saved."));
          });
        }}
      >
        <h3>{t("Horodatage RFC 3161", "RFC 3161 time-stamping")}</h3>
        <p>
          {t(
            "Facultatif. Une fois activé, le worker horodate chaque fichier, chaque sceau du journal et chaque signature auprès de l’autorité choisie (prestataire qualifié eIDAS recommandé).",
            "Optional. Once enabled, the worker time-stamps every file, audit seal and signature with the chosen authority (a qualified eIDAS provider is recommended).",
          )}
        </p>
        {timestamp.source === "environment" && (
          <p>
            {t(
              "Configuration actuelle issue des variables TSA_* du serveur ; l’enregistrement ici la remplace.",
              "Current configuration comes from the server TSA_* variables; saving here replaces it.",
            )}
          </p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={timestamp.enabled}
            onChange={(event) =>
              setTimestamp({ ...timestamp, enabled: event.target.checked })
            }
          />
          {t("Activer l’horodatage", "Enable time-stamping")}
        </label>
        <label>
          {t("URL de l’autorité (TSA)", "Authority URL (TSA)")}
          <input
            type="url"
            required={timestamp.enabled}
            value={timestamp.url}
            placeholder="https://tsa.example.com/tsa"
            onChange={(event) =>
              setTimestamp({ ...timestamp, url: event.target.value })
            }
          />
        </label>
        <label>
          {t("Identifiant (facultatif)", "Username (optional)")}
          <input
            autoComplete="off"
            value={timestamp.username}
            onChange={(event) =>
              setTimestamp({ ...timestamp, username: event.target.value })
            }
          />
        </label>
        <label>
          {t("Mot de passe (facultatif)", "Password (optional)")}
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            placeholder={
              timestamp.hasPassword
                ? t("Inchangé si vide", "Unchanged when empty")
                : ""
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {timestamp.hasPassword && (
          <label className="check">
            <input
              type="checkbox"
              checked={clearPassword}
              onChange={(event) => setClearPassword(event.target.checked)}
            />
            {t(
              "Supprimer le mot de passe enregistré",
              "Remove the stored password",
            )}
          </label>
        )}
        <label>
          {t("OID de politique (facultatif)", "Policy OID (optional)")}
          <input
            value={timestamp.policyOid}
            pattern="(\d+\.)+\d+"
            onChange={(event) =>
              setTimestamp({ ...timestamp, policyOid: event.target.value })
            }
          />
        </label>
        <div className="document-ged-actions">
          <button type="submit" className="primary" disabled={busy}>
            {t("Enregistrer", "Save")}
          </button>
          <button
            type="button"
            disabled={busy || !timestamp.enabled}
            onClick={() =>
              run(async () => {
                const result = await api<{ genTime: string | null }>(
                  "/api/admin/ged/timestamp/test",
                  { method: "POST" },
                );
                onNotice(
                  `${t("Jeton reçu", "Token received")} : ${
                    result.genTime
                      ? new Date(result.genTime).toLocaleString(locale)
                      : "—"
                  }`,
                );
              })
            }
          >
            {t("Tester l’autorité", "Test the authority")}
          </button>
        </div>
      </form>

      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            setSharing(
              await api<SharingSettings>("/api/admin/ged/sharing", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sharing),
              }),
            );
            onNotice(
              t("Partage externe enregistré.", "External sharing saved."),
            );
          });
        }}
      >
        <h3>{t("Partage externe", "External sharing")}</h3>
        <p>
          {t(
            "Liens de téléchargement temporaires pour des personnes sans compte. Réservés aux documents publiés et non sensibles ; chaque accès est audité. Désactiver révoque tous les liens actifs.",
            "Temporary download links for people without an account. Limited to published, non-sensitive documents; every access is audited. Disabling revokes every active link.",
          )}
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={sharing.enabled}
            onChange={(event) =>
              setSharing({ ...sharing, enabled: event.target.checked })
            }
          />
          {t("Autoriser le partage externe", "Allow external sharing")}
        </label>
        <label>
          {t(
            "Durée maximale d’un lien (jours)",
            "Maximum link duration (days)",
          )}
          <input
            type="number"
            min={1}
            max={90}
            value={sharing.maxDays}
            onChange={(event) =>
              setSharing({
                ...sharing,
                maxDays: Math.min(
                  90,
                  Math.max(1, Number(event.target.value) || 1),
                ),
              })
            }
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {t("Enregistrer", "Save")}
        </button>
      </form>
    </section>
  );
}
