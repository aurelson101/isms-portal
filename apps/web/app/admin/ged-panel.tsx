"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api-client";
import { translate } from "../i18n/translate";
import type { Locale } from "../i18n/locale";

type DocumentType = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  requiredFields: string[];
  referencePrefix: string | null;
  nextNumber: number;
};
type Integrity = {
  valid: boolean;
  checked: number;
  pending: number;
  broken: Array<{ chainIndex: string; reason: string }>;
  seals: {
    total: number;
    timestamped: number;
    mismatched: number;
    lastSealAt: string | null;
    lastTimestampAt: string | null;
  };
  timestampAuthorityConfigured: boolean;
};
type Seals = {
  seals: Array<{
    id: string;
    lastChainIndex: string;
    chainHash: string;
    eventCount: number;
    genTime: string | null;
    createdAt: string;
    timestamped: boolean;
  }>;
};
const emptyType = {
  id: "",
  slug: "",
  nameFr: "",
  nameEn: "",
  requiredFields: "",
  referencePrefix: "",
};

export function GedPanel({
  locale,
  spaces,
  onError,
  onNotice,
}: {
  locale: Locale;
  spaces: Array<{ id: string; nameFr: string; nameEn: string }>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [form, setForm] = useState(emptyType);
  const [busy, setBusy] = useState(false);
  const [exportSpace, setExportSpace] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [seals, setSeals] = useState<Seals["seals"]>([]);

  const loadTypes = useCallback(async () => {
    try {
      setTypes(await api<DocumentType[]>("/api/document-types"));
    } catch (error) {
      onError((error as Error).message);
    }
  }, [onError]);
  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const date = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale, {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "—";
  const exportUrl = `/api/admin/ged/export?${new URLSearchParams({
    ...(exportSpace ? { spaceId: exportSpace } : {}),
    ...(exportStatus ? { status: exportStatus } : {}),
  })}`;

  const saveType = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const body = JSON.stringify({
        slug: form.slug.trim(),
        nameFr: form.nameFr.trim(),
        nameEn: form.nameEn.trim(),
        requiredFields: form.requiredFields
          .split(/[,;\n]/u)
          .map((field) => field.trim())
          .filter(Boolean),
        referencePrefix: form.referencePrefix.trim() || null,
      });
      await api(
        form.id
          ? `/api/admin/ged/document-types/${form.id}`
          : "/api/admin/ged/document-types",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      setForm(emptyType);
      onNotice(t("Type documentaire enregistré.", "Document type saved."));
      await loadTypes();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [result, list] = await Promise.all([
        api<Integrity>("/api/admin/ged/audit/integrity"),
        api<Seals>("/api/admin/ged/audit/seals"),
      ]);
      setIntegrity(result);
      setSeals(list.seals);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>
        {t("GED : export, types et preuves", "GED: export, types and evidence")}
      </h1>

      <section className="admin-card">
        <h2>{t("Export en masse", "Bulk export")}</h2>
        <p>
          {t(
            "Archive ZIP de la dernière version saine de chaque document, avec manifest.csv et manifest.json (métadonnées, SHA-256, horodatage). Limite : 1 000 documents et 2 Go.",
            "ZIP archive of the latest clean version of each document, with manifest.csv and manifest.json (metadata, SHA-256, time-stamp). Limit: 1,000 documents and 2 GB.",
          )}
        </p>
        <div className="admin-form">
          <label>
            {t("Espace", "Space")}
            <select
              value={exportSpace}
              onChange={(event) => setExportSpace(event.target.value)}
            >
              <option value="">{t("Tous les espaces", "All spaces")}</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {locale === "fr" ? space.nameFr : space.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("État", "Status")}
            <select
              value={exportStatus}
              onChange={(event) => setExportStatus(event.target.value)}
            >
              <option value="">
                {t("Tous (hors quarantaine)", "All (except quarantine)")}
              </option>
              <option value="PUBLISHED">{t("Publiés", "Published")}</option>
              <option value="DRAFT">{t("Brouillons", "Drafts")}</option>
              <option value="ARCHIVED">{t("Archivés", "Archived")}</option>
            </select>
          </label>
          <a className="primary-link" href={exportUrl} download>
            {t("Télécharger le ZIP", "Download ZIP")}
          </a>
        </div>
      </section>

      <section className="admin-card">
        <h2>{t("Types documentaires", "Document types")}</h2>
        <p>
          {t(
            "Un type rend obligatoires certains champs avant publication et peut numéroter automatiquement la référence (ex. PRO-001). Il s’applique aux documents dont le champ ged.documentType vaut son identifiant.",
            "A type makes some fields mandatory before publication and can number the reference automatically (e.g. PRO-001). It applies to documents whose ged.documentType field equals its identifier.",
          )}
        </p>
        {types.length > 0 && (
          <div className="document-ged-table">
            <table className="document-ged-versions">
              <thead>
                <tr>
                  <th>{t("Identifiant", "Identifier")}</th>
                  <th>{t("Nom", "Name")}</th>
                  <th>{t("Champs obligatoires", "Required fields")}</th>
                  <th>{t("Numérotation", "Numbering")}</th>
                  <th>
                    <span className="document-ged-sr">
                      {t("Actions", "Actions")}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id}>
                    <td>
                      <code>{type.slug}</code>
                    </td>
                    <td>{locale === "fr" ? type.nameFr : type.nameEn}</td>
                    <td>{type.requiredFields.join(", ") || "—"}</td>
                    <td>
                      {type.referencePrefix
                        ? `${type.referencePrefix}-${String(type.nextNumber).padStart(3, "0")}`
                        : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="document-ged-link"
                        onClick={() =>
                          setForm({
                            id: type.id,
                            slug: type.slug,
                            nameFr: type.nameFr,
                            nameEn: type.nameEn,
                            requiredFields: type.requiredFields.join(", "),
                            referencePrefix: type.referencePrefix || "",
                          })
                        }
                      >
                        {t("Modifier", "Edit")}
                      </button>{" "}
                      <button
                        type="button"
                        className="document-ged-link"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !window.confirm(
                              t(
                                "Supprimer ce type ? Les documents gardent leur valeur, sans contrôle.",
                                "Delete this type? Documents keep their value, without checks.",
                              ),
                            )
                          )
                            return;
                          try {
                            await api(
                              `/api/admin/ged/document-types/${type.id}`,
                              {
                                method: "DELETE",
                              },
                            );
                            await loadTypes();
                          } catch (error) {
                            onError((error as Error).message);
                          }
                        }}
                      >
                        {t("Supprimer", "Delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveType();
          }}
        >
          <label>
            {t(
              "Identifiant (ged.documentType)",
              "Identifier (ged.documentType)",
            )}
            <input
              required
              pattern="[a-z0-9][a-z0-9\-]{1,39}"
              value={form.slug}
              disabled={Boolean(form.id)}
              placeholder="procedure"
              onChange={(event) =>
                setForm({ ...form, slug: event.target.value })
              }
            />
          </label>
          <label>
            {t("Nom (français)", "Name (French)")}
            <input
              required
              maxLength={120}
              value={form.nameFr}
              onChange={(event) =>
                setForm({ ...form, nameFr: event.target.value })
              }
            />
          </label>
          <label>
            {t("Nom (anglais)", "Name (English)")}
            <input
              required
              maxLength={120}
              value={form.nameEn}
              onChange={(event) =>
                setForm({ ...form, nameEn: event.target.value })
              }
            />
          </label>
          <label>
            {t(
              "Champs obligatoires (séparés par des virgules)",
              "Required fields (comma-separated)",
            )}
            <input
              value={form.requiredFields}
              placeholder="ged.owner, ged.reference, ged.reviewDate"
              onChange={(event) =>
                setForm({ ...form, requiredFields: event.target.value })
              }
            />
          </label>
          <label>
            {t(
              "Préfixe de référence (facultatif)",
              "Reference prefix (optional)",
            )}
            <input
              pattern="[A-Z0-9][A-Z0-9\-]{0,19}"
              value={form.referencePrefix}
              placeholder="PRO"
              onChange={(event) =>
                setForm({
                  ...form,
                  referencePrefix: event.target.value.toUpperCase(),
                })
              }
            />
          </label>
          <div className="document-ged-actions">
            <button type="submit" className="primary" disabled={busy}>
              {form.id
                ? t("Enregistrer", "Save")
                : t("Créer le type", "Create type")}
            </button>
            {form.id && (
              <button type="button" onClick={() => setForm(emptyType)}>
                {t("Annuler", "Cancel")}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h2>
          {t(
            "Intégrité du journal et horodatage",
            "Audit integrity and time-stamping",
          )}
        </h2>
        <p>
          {t(
            "Chaque événement d’audit est chaîné au précédent (SHA-256). La chaîne est scellée périodiquement et, si une autorité d’horodatage RFC 3161 est configurée (TSA_URL), chaque sceau et chaque fichier reçoit un jeton vérifiable avec openssl ts -verify.",
            "Each audit event is chained to the previous one (SHA-256). The chain is sealed periodically and, when an RFC 3161 time-stamp authority is configured (TSA_URL), each seal and each file receives a token verifiable with openssl ts -verify.",
          )}
        </p>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={verify}
        >
          {t("Vérifier l’intégrité", "Verify integrity")}
        </button>
        {integrity && (
          <dl className="document-reader-meta">
            <div>
              <dt>{t("Résultat", "Result")}</dt>
              <dd role="status">
                {integrity.valid
                  ? t("Chaîne intacte", "Chain intact")
                  : t("Anomalie détectée", "Anomaly detected")}
              </dd>
            </div>
            <div>
              <dt>{t("Événements vérifiés", "Events checked")}</dt>
              <dd>{integrity.checked}</dd>
            </div>
            <div>
              <dt>{t("En attente de chaînage", "Awaiting chaining")}</dt>
              <dd>{integrity.pending}</dd>
            </div>
            <div>
              <dt>{t("Sceaux horodatés", "Time-stamped seals")}</dt>
              <dd>
                {integrity.seals.timestamped} / {integrity.seals.total}
              </dd>
            </div>
            <div>
              <dt>{t("Autorité d’horodatage", "Time-stamp authority")}</dt>
              <dd>
                {integrity.timestampAuthorityConfigured
                  ? t("Configurée", "Configured")
                  : t("Non configurée (TSA_URL)", "Not configured (TSA_URL)")}
              </dd>
            </div>
            {integrity.broken.map((item) => (
              <div key={`${item.chainIndex}-${item.reason}`}>
                <dt>#{item.chainIndex}</dt>
                <dd>{item.reason}</dd>
              </div>
            ))}
          </dl>
        )}
        {seals.length > 0 && (
          <div className="document-ged-table">
            <table className="document-ged-versions">
              <thead>
                <tr>
                  <th>{t("Scellé le", "Sealed on")}</th>
                  <th>{t("Événements", "Events")}</th>
                  <th>{t("Empreinte", "Hash")}</th>
                  <th>{t("Horodatage", "Time-stamp")}</th>
                </tr>
              </thead>
              <tbody>
                {seals.map((seal) => (
                  <tr key={seal.id}>
                    <td>{date(seal.createdAt)}</td>
                    <td>
                      {seal.eventCount} (#{seal.lastChainIndex})
                    </td>
                    <td>
                      <code title={seal.chainHash}>
                        {seal.chainHash.slice(0, 16)}…
                      </code>
                    </td>
                    <td>
                      {seal.timestamped ? (
                        <a href={`/api/admin/ged/audit/seals/${seal.id}/token`}>
                          {date(seal.genTime)}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
