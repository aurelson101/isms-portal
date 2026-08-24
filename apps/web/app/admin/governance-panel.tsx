"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Locale = "fr" | "en";
type DocumentItem = {
  id: string;
  translations: Array<{ locale: string; title: string }>;
  versions: Array<{ id?: string; locale: string; version: number }>;
};
type RuleItem = {
  id: string;
  group: { name: string };
  space: { nameFr: string; nameEn: string };
  lifetime?: boolean;
  certificationDueAt?: string | null;
};
type Review = {
  id: string;
  owner: string;
  reviewer: string;
  approver: string;
  status: string;
  dueAt: string;
  document: DocumentItem;
};
type Control = {
  id: string;
  framework: string;
  reference: string;
  title: string;
  applicability: string;
  implementationStatus: string;
  owner: string;
};
type Retention = {
  id: string;
  documentId: string;
  legalHold: boolean;
  retentionUntil: string | null;
  reason: string;
  destructionStatus: string;
  requestedBy: string | null;
  document: DocumentItem;
};
type Incident = {
  id: string;
  reference: string;
  title: string;
  severity: string;
  status: string;
  owner: string;
  occurredAt: string;
  rootCause: string | null;
  correctiveActions: Array<{
    id: string;
    description: string;
    owner: string;
    dueAt: string;
    status: string;
  }>;
};
type SavedView = {
  id: string;
  section: string;
  name: string;
  config: Record<string, unknown>;
};

const jsonApi = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };
  if (!response.ok)
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(", ")
        : payload.message || response.statusText,
    );
  return payload;
};

const titleFor = (document: DocumentItem, locale: Locale) =>
  document.translations.find((translation) => translation.locale === locale)
    ?.title ||
  document.translations[0]?.title ||
  document.id;

export function GovernancePanel({
  locale,
  documents,
  rules,
  onChanged,
  onError,
  onNotice,
}: {
  locale: Locale;
  documents: DocumentItem[];
  rules: RuleItem[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [section, setSection] = useState("reviews");
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [certifications, setCertifications] = useState<RuleItem[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [retentions, setRetentions] = useState<Retention[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [identityHealth, setIdentityHealth] = useState<Record<string, unknown>>(
    {},
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedIncidentIds, setSelectedIncidentIds] = useState<string[]>([]);
  const [bulkPreview, setBulkPreview] = useState<{
    count: number;
    value: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [
        summaryData,
        reviewData,
        certificationData,
        controlData,
        retentionData,
        incidentData,
        healthData,
        viewData,
      ] = await Promise.all([
        jsonApi<Record<string, number>>("/api/admin/governance/summary"),
        jsonApi<Review[]>("/api/admin/governance/reviews"),
        jsonApi<RuleItem[]>("/api/admin/governance/access-certifications"),
        jsonApi<Control[]>("/api/admin/governance/controls"),
        jsonApi<Retention[]>("/api/admin/governance/retention"),
        jsonApi<Incident[]>("/api/admin/governance/incidents"),
        jsonApi<Record<string, unknown>>(
          "/api/admin/governance/identity-health?dormantDays=90",
        ),
        jsonApi<SavedView[]>("/api/admin/governance/saved-views"),
      ]);
      setSummary(summaryData);
      setReviews(reviewData);
      setCertifications(certificationData);
      setControls(controlData);
      setRetentions(retentionData);
      setIncidents(incidentData);
      setIdentityHealth(healthData);
      setSavedViews(viewData);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => void refresh(), [refresh]);

  const submit = async (
    url: string,
    body: Record<string, unknown>,
    method = "POST",
  ) => {
    try {
      await jsonApi(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onNotice(t("Enregistrement effectué.", "Saved successfully."));
      await Promise.all([refresh(), onChanged()]);
    } catch (error) {
      onError((error as Error).message);
      throw error;
    }
  };

  const sections = [
    ["reviews", "Revues", "Reviews", summary.reviews || 0],
    [
      "access",
      "Accès lifetime",
      "Lifetime access",
      summary.certifications || 0,
    ],
    ["controls", "Contrôles et SoA", "Controls and SoA", summary.controls || 0],
    ["retention", "Rétention", "Retention", summary.holds || 0],
    ["identity", "Santé identité", "Identity health", 0],
    [
      "incidents",
      "Incidents et CAPA",
      "Incidents and CAPA",
      summary.incidents || 0,
    ],
    ["views", "Vues et lots", "Views and bulk", savedViews.length],
  ] as const;

  return (
    <section className="governance-panel">
      <div className="section-heading">
        <div>
          <h1>{t("Gouvernance ISMS", "ISMS governance")}</h1>
          <p className="lead">
            {t(
              "Revues, accès permanents, conformité, rétention, identité et traitement des incidents.",
              "Reviews, permanent access, compliance, retention, identity and incident handling.",
            )}
          </p>
        </div>
        <button type="button" onClick={() => void refresh()}>
          {t("Actualiser", "Refresh")}
        </button>
      </div>
      <div className="governance-tabs" role="tablist">
        {sections.map(([key, fr, en, count]) => (
          <button
            type="button"
            role="tab"
            aria-selected={section === key}
            className={section === key ? "active" : ""}
            onClick={() => setSection(key)}
            key={key}
          >
            {locale === "fr" ? fr : en} <span>{count}</span>
          </button>
        ))}
      </div>
      {loading ? (
        <div
          className="admin-skeleton"
          aria-label={t("Actualisation", "Refreshing")}
        />
      ) : (
        <>
          {section === "reviews" && (
            <ReviewsSection
              locale={locale}
              documents={documents}
              reviews={reviews}
              submit={submit}
            />
          )}
          {section === "access" && (
            <AccessSection
              locale={locale}
              rules={certifications.length ? certifications : rules}
              submit={submit}
            />
          )}
          {section === "controls" && (
            <ControlsSection
              locale={locale}
              documents={documents}
              controls={controls}
              submit={submit}
            />
          )}
          {section === "retention" && (
            <RetentionSection
              locale={locale}
              documents={documents}
              policies={retentions}
              submit={submit}
            />
          )}
          {section === "identity" && (
            <IdentitySection locale={locale} data={identityHealth} />
          )}
          {section === "incidents" && (
            <IncidentsSection
              locale={locale}
              incidents={incidents}
              selected={selectedIncidentIds}
              setSelected={setSelectedIncidentIds}
              submit={submit}
            />
          )}
          {section === "views" && (
            <ViewsSection
              locale={locale}
              savedViews={savedViews}
              incidents={incidents}
              selectedIds={selectedIncidentIds}
              preview={bulkPreview}
              setPreview={setBulkPreview}
              refresh={refresh}
              onError={onError}
              onNotice={onNotice}
            />
          )}
        </>
      )}
    </section>
  );
}

function ReviewsSection({
  locale,
  documents,
  reviews,
  submit,
}: {
  locale: Locale;
  documents: DocumentItem[];
  reviews: Review[];
  submit: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<void>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [draft, setDraft] = useState({
    documentId: "",
    owner: "",
    reviewer: "",
    approver: "",
    dueAt: "",
  });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await submit("/api/admin/governance/reviews", {
      ...draft,
      dueAt: new Date(draft.dueAt).toISOString(),
    });
    setDraft({
      documentId: "",
      owner: "",
      reviewer: "",
      approver: "",
      dueAt: "",
    });
  };
  return (
    <div className="governance-grid">
      <form
        className="admin-form governance-form"
        onSubmit={(event) => void create(event)}
      >
        <h2>{t("Planifier une revue", "Schedule a review")}</h2>
        <label>
          {t("Document", "Document")}
          <select
            required
            value={draft.documentId}
            onChange={(e) => setDraft({ ...draft, documentId: e.target.value })}
          >
            <option value="">{t("Sélectionner…", "Select…")}</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {titleFor(document, locale)}
              </option>
            ))}
          </select>
        </label>
        {(["owner", "reviewer", "approver"] as const).map((key) => (
          <label key={key}>
            {key === "owner"
              ? t("Propriétaire", "Owner")
              : key === "reviewer"
                ? t("Relecteur", "Reviewer")
                : t("Approbateur", "Approver")}
            <input
              required
              minLength={2}
              maxLength={160}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          {t("Échéance", "Due date")}
          <input
            required
            type="datetime-local"
            value={draft.dueAt}
            onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
          />
        </label>
        <button className="primary" type="submit">
          {t("Créer la revue", "Create review")}
        </button>
      </form>
      <div className="governance-list">
        <h2>{t("Revues en cours", "Current reviews")}</h2>
        {reviews.map((review) => (
          <article className="governance-card" key={review.id}>
            <strong>{titleFor(review.document, locale)}</strong>
            <span className={`status ${review.status.toLowerCase()}`}>
              {review.status}
            </span>
            <p>
              {review.owner} → {review.reviewer} → {review.approver}
            </p>
            <small>{new Date(review.dueAt).toLocaleString(locale)}</small>
            {!["APPROVED", "REJECTED", "CANCELLED"].includes(review.status) && (
              <div className="actions">
                <button
                  type="button"
                  onClick={() =>
                    void submit(
                      `/api/admin/governance/reviews/${review.id}/decision`,
                      {
                        status: "APPROVED",
                        comment: t("Revue approuvée", "Review approved"),
                      },
                      "PUT",
                    )
                  }
                >
                  {t("Approuver", "Approve")}
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() =>
                    void submit(
                      `/api/admin/governance/reviews/${review.id}/decision`,
                      {
                        status: "REJECTED",
                        comment: t("Revue refusée", "Review rejected"),
                      },
                      "PUT",
                    )
                  }
                >
                  {t("Refuser", "Reject")}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function AccessSection({
  locale,
  rules,
  submit,
}: {
  locale: Locale;
  rules: RuleItem[];
  submit: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<void>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  return (
    <div className="governance-list">
      <div className="notice">
        {t(
          "Lifetime signifie permanent : aucune date d’expiration ni échéance de recertification automatique. Une confirmation manuelle reste auditée.",
          "Lifetime means permanent: no expiry date or automatic recertification deadline. Manual confirmation remains audited.",
        )}
      </div>
      {rules.map((rule) => (
        <article className="governance-card" key={rule.id}>
          <strong>{rule.group.name}</strong>
          <p>{locale === "fr" ? rule.space.nameFr : rule.space.nameEn}</p>
          <span
            className={`status ${rule.lifetime !== false ? "approved" : "pending"}`}
          >
            {rule.lifetime !== false
              ? "Lifetime"
              : t("À recertifier", "Recertification required")}
          </span>
          <div className="actions">
            <button
              type="button"
              onClick={() =>
                void submit(
                  `/api/admin/governance/access-certifications/${rule.id}`,
                  {
                    lifetime: true,
                    justification: t(
                      "Accès permanent confirmé",
                      "Permanent access confirmed",
                    ),
                  },
                  "PUT",
                )
              }
            >
              {t("Confirmer lifetime", "Confirm lifetime")}
            </button>
            <button
              type="button"
              onClick={() =>
                void submit(
                  `/api/admin/governance/access-certifications/${rule.id}`,
                  {
                    lifetime: false,
                    certificationDueAt: new Date(
                      Date.now() + 365 * 86400000,
                    ).toISOString(),
                    justification: t(
                      "Recertification annuelle",
                      "Annual recertification",
                    ),
                  },
                  "PUT",
                )
              }
            >
              {t("Recertifier dans 1 an", "Recertify in 1 year")}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ControlsSection({
  locale,
  documents,
  controls,
  submit,
}: {
  locale: Locale;
  documents: DocumentItem[];
  controls: Control[];
  submit: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<void>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [draft, setDraft] = useState({
    framework: "ISO 27001",
    reference: "",
    title: "",
    applicability: "APPLICABLE",
    implementationStatus: "PLANNED",
    owner: "",
    justification: "",
    evidenceDocumentId: "",
  });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await submit("/api/admin/governance/controls", draft);
    setDraft({
      ...draft,
      reference: "",
      title: "",
      justification: "",
      evidenceDocumentId: "",
    });
  };
  return (
    <div className="governance-grid">
      <form
        className="admin-form governance-form"
        onSubmit={(e) => void create(e)}
      >
        <h2>{t("Ajouter un contrôle", "Add a control")}</h2>
        {(["framework", "reference", "title", "owner"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          {t("Applicabilité", "Applicability")}
          <select
            value={draft.applicability}
            onChange={(e) =>
              setDraft({ ...draft, applicability: e.target.value })
            }
          >
            <option value="APPLICABLE">{t("Applicable", "Applicable")}</option>
            <option value="NOT_APPLICABLE">
              {t("Non applicable", "Not applicable")}
            </option>
          </select>
        </label>
        <label>
          {t("État", "Status")}
          <select
            value={draft.implementationStatus}
            onChange={(e) =>
              setDraft({ ...draft, implementationStatus: e.target.value })
            }
          >
            <option value="PLANNED">{t("Planifié", "Planned")}</option>
            <option value="PARTIAL">{t("Partiel", "Partial")}</option>
            <option value="IMPLEMENTED">
              {t("Implémenté", "Implemented")}
            </option>
            <option value="NOT_IMPLEMENTED">
              {t("Non implémenté", "Not implemented")}
            </option>
          </select>
        </label>
        <label>
          {t("Preuve documentaire", "Documentary evidence")}
          <select
            value={draft.evidenceDocumentId}
            onChange={(e) =>
              setDraft({ ...draft, evidenceDocumentId: e.target.value })
            }
          >
            <option value="">—</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {titleFor(document, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Justification", "Justification")}
          <textarea
            maxLength={2000}
            value={draft.justification}
            onChange={(e) =>
              setDraft({ ...draft, justification: e.target.value })
            }
          />
        </label>
        <button className="primary">{t("Ajouter", "Add")}</button>
      </form>
      <div className="governance-list">
        <h2>
          {t("Déclaration d’applicabilité", "Statement of applicability")}
        </h2>
        {controls.map((control) => (
          <article className="governance-card" key={control.id}>
            <strong>
              {control.framework} {control.reference}
            </strong>
            <p>{control.title}</p>
            <span className="status">
              {control.applicability} · {control.implementationStatus}
            </span>
            <small>{control.owner}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function RetentionSection({
  locale,
  documents,
  policies,
  submit,
}: {
  locale: Locale;
  documents: DocumentItem[];
  policies: Retention[];
  submit: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<void>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [draft, setDraft] = useState({
    documentId: "",
    retentionUntil: "",
    legalHold: false,
    reason: "",
  });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    await submit(
      "/api/admin/governance/retention",
      {
        ...draft,
        retentionUntil: draft.retentionUntil
          ? new Date(draft.retentionUntil).toISOString()
          : undefined,
      },
      "PUT",
    );
  };
  return (
    <div className="governance-grid">
      <form
        className="admin-form governance-form"
        onSubmit={(e) => void save(e)}
      >
        <h2>{t("Politique de conservation", "Retention policy")}</h2>
        <label>
          {t("Document", "Document")}
          <select
            required
            value={draft.documentId}
            onChange={(e) => setDraft({ ...draft, documentId: e.target.value })}
          >
            <option value="">{t("Sélectionner…", "Select…")}</option>
            {documents.map((document) => (
              <option value={document.id} key={document.id}>
                {titleFor(document, locale)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Conserver jusqu’au", "Retain until")}
          <input
            type="date"
            value={draft.retentionUntil}
            onChange={(e) =>
              setDraft({ ...draft, retentionUntil: e.target.value })
            }
          />
        </label>
        <label className="toggle">
          {t("Gel réglementaire", "Legal hold")}
          <input
            type="checkbox"
            checked={draft.legalHold}
            onChange={(e) =>
              setDraft({ ...draft, legalHold: e.target.checked })
            }
          />
        </label>
        <label>
          {t("Motif", "Reason")}
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
        </label>
        <button className="primary">{t("Enregistrer", "Save")}</button>
      </form>
      <div className="governance-list">
        {policies.map((policy) => (
          <article className="governance-card" key={policy.id}>
            <strong>{titleFor(policy.document, locale)}</strong>
            <span
              className={`status ${policy.legalHold ? "rejected" : "approved"}`}
            >
              {policy.legalHold
                ? t("Gel actif", "Legal hold")
                : policy.destructionStatus}
            </span>
            <p>{policy.reason}</p>
            <small>
              {policy.retentionUntil
                ? new Date(policy.retentionUntil).toLocaleDateString(locale)
                : t("Sans échéance", "No deadline")}
            </small>
            {!policy.legalHold && (
              <div className="actions">
                {policy.destructionStatus !== "REQUESTED" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void submit(
                        `/api/admin/governance/retention/${policy.id}/destruction`,
                        {
                          action: "REQUEST",
                          reason: t(
                            "Demande de destruction après rétention",
                            "Destruction request after retention",
                          ),
                        },
                        "PUT",
                      )
                    }
                  >
                    {t("Demander la destruction", "Request destruction")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        void submit(
                          `/api/admin/governance/retention/${policy.id}/destruction`,
                          {
                            action: "APPROVE",
                            reason: t("Seconde approbation", "Second approval"),
                          },
                          "PUT",
                        )
                      }
                    >
                      {t("Approuver", "Approve")}
                    </button>
                    <button
                      className="danger"
                      type="button"
                      onClick={() =>
                        void submit(
                          `/api/admin/governance/retention/${policy.id}/destruction`,
                          {
                            action: "REJECT",
                            reason: t("Demande refusée", "Request rejected"),
                          },
                          "PUT",
                        )
                      }
                    >
                      {t("Refuser", "Reject")}
                    </button>
                  </>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function IdentitySection({
  locale,
  data,
}: {
  locale: Locale;
  data: Record<string, unknown>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const dormant =
    (data.dormantAccounts as Array<Record<string, unknown>> | undefined) || [];
  const stale =
    (data.staleGroups as Array<Record<string, unknown>> | undefined) || [];
  const connections =
    (data.connections as Array<Record<string, unknown>> | undefined) || [];
  const certificates =
    (data.certificates as Array<Record<string, unknown>> | undefined) || [];
  return (
    <div className="governance-metrics">
      <article>
        <strong>{connections.length}</strong>
        <span>{t("Connecteurs", "Connectors")}</span>
      </article>
      <article>
        <strong>{certificates.length}</strong>
        <span>{t("Certificats", "Certificates")}</span>
      </article>
      <article>
        <strong>{dormant.length}</strong>
        <span>{t("Comptes dormants (90 j)", "Dormant accounts (90d)")}</span>
      </article>
      <article>
        <strong>{stale.length}</strong>
        <span>{t("Groupes non synchronisés", "Stale groups")}</span>
      </article>
      <article>
        <strong>{String(data.activeSessions || 0)}</strong>
        <span>{t("Sessions admin actives", "Active admin sessions")}</span>
      </article>
      <pre className="health-json">
        {JSON.stringify(
          { connections, dormantAccounts: dormant, staleGroups: stale },
          null,
          2,
        )}
      </pre>
    </div>
  );
}

function IncidentsSection({
  locale,
  incidents,
  selected,
  setSelected,
  submit,
}: {
  locale: Locale;
  incidents: Incident[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  submit: (
    url: string,
    body: Record<string, unknown>,
    method?: string,
  ) => Promise<void>;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [draft, setDraft] = useState({
    reference: "",
    title: "",
    severity: "MEDIUM",
    status: "OPEN",
    owner: "",
    occurredAt: "",
    rootCause: "",
    lessonsLearned: "",
  });
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await submit("/api/admin/governance/incidents", {
      ...draft,
      occurredAt: new Date(draft.occurredAt).toISOString(),
    });
    setDraft({
      ...draft,
      reference: "",
      title: "",
      rootCause: "",
      lessonsLearned: "",
    });
  };
  return (
    <div className="governance-grid">
      <form
        className="admin-form governance-form"
        onSubmit={(e) => void create(e)}
      >
        <h2>{t("Ouvrir un incident", "Open an incident")}</h2>
        {(["reference", "title", "owner"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              required
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          {t("Sévérité", "Severity")}
          <select
            value={draft.severity}
            onChange={(e) => setDraft({ ...draft, severity: e.target.value })}
          >
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Survenu le", "Occurred at")}
          <input
            required
            type="datetime-local"
            value={draft.occurredAt}
            onChange={(e) => setDraft({ ...draft, occurredAt: e.target.value })}
          />
        </label>
        <button className="primary">{t("Créer", "Create")}</button>
      </form>
      <div className="governance-list">
        {incidents.map((incident) => (
          <article className="governance-card" key={incident.id}>
            <label className="bulk-select">
              <input
                type="checkbox"
                checked={selected.includes(incident.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, incident.id]
                      : selected.filter((id) => id !== incident.id),
                  )
                }
              />
              {t("Sélectionner", "Select")}
            </label>
            <strong>
              {incident.reference} · {incident.title}
            </strong>
            <span className={`status ${incident.severity.toLowerCase()}`}>
              {incident.severity} · {incident.status}
            </span>
            <p>
              {incident.owner} ·{" "}
              {new Date(incident.occurredAt).toLocaleString(locale)}
            </p>
            {incident.correctiveActions.map((action) => (
              <small key={action.id}>
                CAPA: {action.description} — {action.owner} — {action.status}
              </small>
            ))}
            <button
              type="button"
              onClick={() =>
                void submit(
                  `/api/admin/governance/incidents/${incident.id}/actions`,
                  {
                    description: t(
                      "Analyser et corriger la cause racine",
                      "Analyze and correct root cause",
                    ),
                    owner: incident.owner,
                    dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
                    status: "OPEN",
                  },
                )
              }
            >
              {t("Ajouter une CAPA à 30 jours", "Add 30-day CAPA")}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ViewsSection({
  locale,
  savedViews,
  incidents,
  selectedIds,
  preview,
  setPreview,
  refresh,
  onError,
  onNotice,
}: {
  locale: Locale;
  savedViews: SavedView[];
  incidents: Incident[];
  selectedIds: string[];
  preview: { count: number; value: string } | null;
  setPreview: (value: { count: number; value: string } | null) => void;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [name, setName] = useState("");
  const [bulkStatus, setBulkStatus] = useState("INVESTIGATING");
  const safe = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const saveView = () =>
    safe(async () => {
      await jsonApi("/api/admin/governance/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "incidents",
          name,
          config: { status: bulkStatus },
        }),
      });
      setName("");
      onNotice(t("Vue privée enregistrée.", "Private view saved."));
      await refresh();
    });
  const previewBulk = () =>
    safe(async () => {
      const result = await jsonApi<{ count: number; value: string }>(
        "/api/admin/governance/bulk/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "INCIDENT_STATUS",
            ids: selectedIds,
            value: bulkStatus,
          }),
        },
      );
      setPreview(result);
    });
  const applyBulk = () =>
    safe(async () => {
      await jsonApi("/api/admin/governance/bulk/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "INCIDENT_STATUS",
          ids: selectedIds,
          value: bulkStatus,
          confirmed: true,
        }),
      });
      setPreview(null);
      onNotice(
        t(
          "Traitement groupé appliqué et audité.",
          "Bulk operation applied and audited.",
        ),
      );
      await refresh();
    });
  return (
    <div className="governance-grid">
      <div className="admin-form governance-form">
        <h2>{t("Vue privée", "Private view")}</h2>
        <label>
          {t("Nom", "Name")}
          <input
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t("Filtre d’état", "Status filter")}
          <select
            value={bulkStatus}
            onChange={(e) => {
              setBulkStatus(e.target.value);
              setPreview(null);
            }}
          >
            {["OPEN", "INVESTIGATING", "CONTAINED", "RESOLVED", "CLOSED"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <button
          type="button"
          disabled={name.trim().length < 2}
          onClick={saveView}
        >
          {t("Enregistrer la vue", "Save view")}
        </button>
        <ul>
          {savedViews.map((view) => (
            <li key={view.id}>
              <strong>{view.name}</strong> · {view.section}
              <button
                type="button"
                aria-label={t("Supprimer la vue", "Delete view")}
                onClick={() =>
                  void safe(async () => {
                    await jsonApi(
                      `/api/admin/governance/saved-views/${view.id}`,
                      { method: "DELETE" },
                    );
                    await refresh();
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="admin-form governance-form">
        <h2>{t("Traitement groupé sûr", "Safe bulk operation")}</h2>
        <p>
          {selectedIds.length} / {incidents.length}{" "}
          {t("incident(s) sélectionné(s)", "incident(s) selected")}
        </p>
        <button
          type="button"
          disabled={!selectedIds.length}
          onClick={previewBulk}
        >
          {t("Prévisualiser l’impact", "Preview impact")}
        </button>
        {preview && (
          <div className="notice" role="status">
            <strong>{preview.count}</strong>{" "}
            {t("élément(s) passeront à", "item(s) will move to")}{" "}
            {preview.value}
            <button className="primary" type="button" onClick={applyBulk}>
              {t("Confirmer et appliquer", "Confirm and apply")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
