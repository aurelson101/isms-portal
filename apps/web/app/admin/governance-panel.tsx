"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";

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
  decisionComment: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
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
type DirectoryUser = {
  username: string;
  displayName: string;
  email: string | null;
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

const statusLabels: Record<string, [string, string]> = {
  APPROVED: ["Approuvée", "Approved"],
  REJECTED: ["Refusée", "Rejected"],
  CANCELLED: ["Annulée", "Cancelled"],
  IN_REVIEW: ["En cours de revue", "In review"],
  PENDING: ["En attente", "Pending"],
  APPLICABLE: ["Applicable", "Applicable"],
  NOT_APPLICABLE: ["Non applicable", "Not applicable"],
  PLANNED: ["Planifié", "Planned"],
  PARTIAL: ["Partiellement réalisé", "Partially implemented"],
  IMPLEMENTED: ["Mis en œuvre", "Implemented"],
  NOT_IMPLEMENTED: ["Non mis en œuvre", "Not implemented"],
  LOW: ["Faible", "Low"],
  MEDIUM: ["Moyenne", "Medium"],
  HIGH: ["Élevée", "High"],
  CRITICAL: ["Critique", "Critical"],
  OPEN: ["Ouvert", "Open"],
  INVESTIGATING: ["En investigation", "Investigating"],
  CONTAINED: ["Contenu", "Contained"],
  RESOLVED: ["Résolu", "Resolved"],
  CLOSED: ["Clôturé", "Closed"],
  IN_PROGRESS: ["En cours", "In progress"],
  DONE: ["Terminée", "Done"],
  NONE: ["Aucune demande", "No request"],
  REQUESTED: ["Destruction demandée", "Destruction requested"],
};

const statusLabel = (locale: Locale, value: string) =>
  statusLabels[value]?.[locale === "fr" ? 0 : 1] || value;

const sectionsForErrors = (locale: Locale) =>
  locale === "fr"
    ? [
        "synthèse",
        "revues",
        "accès",
        "contrôles",
        "rétention",
        "incidents",
        "identités",
        "vues",
      ]
    : [
        "summary",
        "reviews",
        "access",
        "controls",
        "retention",
        "incidents",
        "identities",
        "views",
      ];

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
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const requests = [
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
    ] as const;
    const results = await Promise.allSettled(requests);
    const setters = [
      setSummary,
      setReviews,
      setCertifications,
      setControls,
      setRetentions,
      setIncidents,
      setIdentityHealth,
      setSavedViews,
    ] as const;
    const failed: string[] = [];
    const names = sectionsForErrors(locale);
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        (setters[index] as (value: unknown) => void)(result.value);
      } else failed.push(names[index]);
    });
    if (failed.length)
      onError(
        (locale === "fr"
          ? "Impossible d’actualiser : "
          : "Could not refresh: ") + failed.join(", "),
      );
    setInitialLoading(false);
    setRefreshing(false);
  }, [locale, onError]);

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
      await refresh();
      if (url.includes("/access-certifications/")) await onChanged();
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
    <section className="governance-panel" aria-busy={refreshing}>
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
      {refreshing && (
        <span className="governance-refreshing" role="status">
          {t("Actualisation en arrière-plan…", "Refreshing in background…")}
        </span>
      )}
      <div
        className="governance-tabs"
        role="tablist"
        aria-label={t("Rubriques de gouvernance", "Governance sections")}
      >
        {sections.map(([key, fr, en, count]) => (
          <button
            type="button"
            role="tab"
            id={`governance-tab-${key}`}
            data-section={key}
            aria-controls={`governance-panel-${key}`}
            aria-selected={section === key}
            tabIndex={section === key ? 0 : -1}
            className={section === key ? "active" : ""}
            onClick={() => setSection(key)}
            onKeyDown={(event) => {
              const tabs = Array.from(
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ) || [],
              );
              const current = tabs.indexOf(event.currentTarget);
              const target =
                event.key === "Home"
                  ? tabs[0]
                  : event.key === "End"
                    ? tabs.at(-1)
                    : event.key === "ArrowRight"
                      ? tabs[(current + 1) % tabs.length]
                      : event.key === "ArrowLeft"
                        ? tabs[(current - 1 + tabs.length) % tabs.length]
                        : null;
              if (!target) return;
              event.preventDefault();
              setSection(target.dataset.section || "reviews");
              target.focus();
            }}
            key={key}
          >
            {locale === "fr" ? fr : en} <span>{count}</span>
          </button>
        ))}
      </div>
      {initialLoading ? (
        <div
          className="admin-skeleton"
          aria-label={t("Actualisation", "Refreshing")}
        />
      ) : (
        <div
          role="tabpanel"
          id={`governance-panel-${section}`}
          aria-labelledby={`governance-tab-${section}`}
          tabIndex={0}
        >
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
        </div>
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
  const [decision, setDecision] = useState<{
    id: string;
    status: "APPROVED" | "REJECTED";
    comment: string;
  } | null>(null);
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
        id="governance-review-form"
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
          <ReviewActorPicker
            key={key}
            locale={locale}
            label={
              key === "owner"
                ? t("Propriétaire", "Owner")
                : key === "reviewer"
                  ? t("Relecteur", "Reviewer")
                  : t("Approbateur", "Approver")
            }
            value={draft[key]}
            onChange={(value) =>
              setDraft((current) => ({ ...current, [key]: value }))
            }
          />
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
        <button
          className="primary"
          type="submit"
          disabled={
            !draft.documentId ||
            !draft.owner ||
            !draft.reviewer ||
            !draft.approver ||
            !draft.dueAt
          }
        >
          {t("Créer la revue", "Create review")}
        </button>
      </form>
      <div className="governance-list">
        <h2>{t("Revues en cours", "Current reviews")}</h2>
        {reviews.map((review) => (
          <article className="governance-card" key={review.id}>
            <strong>{titleFor(review.document, locale)}</strong>
            <span className={`status ${review.status.toLowerCase()}`}>
              {statusLabel(locale, review.status)}
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
                    setDecision({
                      id: review.id,
                      status: "APPROVED",
                      comment: "",
                    })
                  }
                >
                  {t("Approuver", "Approve")}
                </button>
                <button
                  className="danger"
                  type="button"
                  onClick={() =>
                    setDecision({
                      id: review.id,
                      status: "REJECTED",
                      comment: "",
                    })
                  }
                >
                  {t("Refuser", "Reject")}
                </button>
              </div>
            )}
            {["APPROVED", "REJECTED", "CANCELLED"].includes(review.status) && (
              <div className="governance-decision-proof">
                <strong>{t("Preuve de décision", "Decision evidence")}</strong>
                <p>{review.decisionComment}</p>
                <small>
                  {review.decidedBy || "—"}
                  {review.decidedAt
                    ? ` · ${new Date(review.decidedAt).toLocaleString(locale)}`
                    : ""}
                </small>
                {review.status === "APPROVED" && (
                  <button
                    type="button"
                    className="primary schedule-next-review"
                    onClick={() => {
                      const next = new Date();
                      next.setFullYear(next.getFullYear() + 1);
                      setDraft({
                        documentId: review.document.id,
                        owner: review.owner,
                        reviewer: review.reviewer,
                        approver: review.approver,
                        dueAt: next.toISOString().slice(0, 16),
                      });
                      document
                        .getElementById("governance-review-form")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  >
                    <Icon name="audit" />{" "}
                    {t(
                      "Planifier la prochaine revue dans un an",
                      "Schedule the next review in one year",
                    )}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {decision && (
        <div className="confirmation-backdrop" role="presentation">
          <form
            className="confirmation-dialog governance-decision-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-decision-title"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(
                `/api/admin/governance/reviews/${decision.id}/decision`,
                { status: decision.status, comment: decision.comment },
                "PUT",
              ).then(() => setDecision(null));
            }}
          >
            <h2 id="review-decision-title">
              {decision.status === "APPROVED"
                ? t("Justifier l’approbation", "Justify approval")
                : t("Motiver le refus", "Explain rejection")}
            </h2>
            <p>
              {t(
                "Cette justification sera conservée avec l’auteur et la date de décision.",
                "This justification will be retained with the decision author and date.",
              )}
            </p>
            <label>
              {t("Commentaire de décision", "Decision comment")}
              <textarea
                required
                minLength={3}
                maxLength={2000}
                autoFocus
                value={decision.comment}
                onChange={(event) =>
                  setDecision({ ...decision, comment: event.target.value })
                }
              />
            </label>
            <div className="confirmation-actions">
              <button type="button" onClick={() => setDecision(null)}>
                {t("Annuler", "Cancel")}
              </button>
              <button
                className={
                  decision.status === "REJECTED" ? "solid-danger" : "primary"
                }
                type="submit"
                disabled={decision.comment.trim().length < 3}
              >
                {decision.status === "APPROVED"
                  ? t("Confirmer l’approbation", "Confirm approval")
                  : t("Confirmer le refus", "Confirm rejection")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ReviewActorPicker({
  locale,
  label,
  value,
  onChange,
}: {
  locale: Locale;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [mode, setMode] = useState<"directory" | "manual">("directory");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [directoryMessage, setDirectoryMessage] = useState("");
  const [selected, setSelected] = useState<DirectoryUser | null>(null);

  useEffect(() => {
    if (!value) setSelected(null);
  }, [value]);

  useEffect(() => {
    if (mode !== "directory" || query.trim().length < 2) {
      setUsers([]);
      setSearching(false);
      setDirectoryMessage("");
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setDirectoryMessage("");
    const timer = window.setTimeout(() => {
      jsonApi<DirectoryUser[]>(
        `/api/admin/accounts/directory-users/${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then((matches) => {
          setUsers(matches);
          if (!matches.length)
            setDirectoryMessage(
              locale === "fr"
                ? "Aucun utilisateur AD trouvé."
                : "No AD user found.",
            );
        })
        .catch((error) => {
          if ((error as Error).name !== "AbortError") {
            setUsers([]);
            setDirectoryMessage(
              locale === "fr"
                ? "Annuaire indisponible. Utilisez la saisie manuelle."
                : "Directory unavailable. Use manual entry.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [locale, mode, query]);

  return (
    <fieldset className="review-actor-picker">
      <legend>{label}</legend>
      <div className="review-actor-modes">
        <button
          type="button"
          className={mode === "directory" ? "active" : ""}
          aria-pressed={mode === "directory"}
          onClick={() => {
            setMode("directory");
            onChange("");
          }}
        >
          {t("Utilisateur AD", "AD user")}
        </button>
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          aria-pressed={mode === "manual"}
          onClick={() => {
            setMode("manual");
            setSelected(null);
            onChange("");
          }}
        >
          {t("Saisie manuelle", "Manual entry")}
        </button>
      </div>
      {mode === "directory" && selected ? (
        <div className="review-actor-selected" role="status">
          <div>
            <span>{t("Utilisateur AD sélectionné", "Selected AD user")}</span>
            <strong>{selected.displayName}</strong>
            <small>{selected.email || selected.username}</small>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              onChange("");
            }}
          >
            {t("Modifier", "Change")}
          </button>
        </div>
      ) : mode === "directory" ? (
        <>
          <label>
            {t("Rechercher dans l’annuaire", "Search directory")}
            <input
              value={query}
              minLength={2}
              maxLength={120}
              autoComplete="off"
              placeholder={t(
                "Nom, identifiant ou e-mail",
                "Name, username or email",
              )}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(null);
                onChange("");
              }}
            />
          </label>
          <div className="review-actor-results">
            {users.map((user) => (
              <button
                type="button"
                key={user.username}
                className={
                  selected?.username === user.username ? "selected" : ""
                }
                aria-pressed={selected?.username === user.username}
                onClick={() => {
                  setSelected(user);
                  setUsers([]);
                  onChange(user.username);
                }}
              >
                <strong>{user.displayName}</strong>
                <small>{user.email || user.username}</small>
              </button>
            ))}
          </div>
          <p className="directory-search-status" aria-live="polite">
            {searching
              ? t("Recherche en cours…", "Searching…")
              : directoryMessage ||
                (query.trim().length < 2
                  ? t(
                      "Saisissez au moins deux caractères.",
                      "Enter at least two characters.",
                    )
                  : "")}
          </p>
        </>
      ) : (
        <label>
          {t("Nom ou identifiant manuel", "Manual name or identifier")}
          <input
            required
            minLength={2}
            maxLength={160}
            value={value}
            placeholder={t(
              "Ex. prestataire@example.com",
              "E.g. contractor@example.com",
            )}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
    </fieldset>
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
              onClick={() => {
                const expiry = new Date(
                  Date.now() + 365 * 86400000,
                ).toISOString();
                void submit(
                  `/api/admin/governance/access-certifications/${rule.id}`,
                  {
                    lifetime: false,
                    validUntil: expiry,
                    certificationDueAt: expiry,
                    justification: t(
                      "Recertification annuelle",
                      "Annual recertification",
                    ),
                  },
                  "PUT",
                );
              }}
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
            {
              {
                framework: t("Référentiel", "Framework"),
                reference: t("Référence", "Reference"),
                title: t("Intitulé", "Title"),
                owner: t("Responsable", "Owner"),
              }[key]
            }
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
              {statusLabel(locale, control.applicability)} ·{" "}
              {statusLabel(locale, control.implementationStatus)}
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
                : statusLabel(locale, policy.destructionStatus)}
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
  const formatDate = (value: unknown) =>
    typeof value === "string" || value instanceof Date
      ? new Date(value).toLocaleString(locale)
      : t("Jamais", "Never");
  return (
    <div className="identity-health">
      <div className="governance-metrics">
        {[
          [connections.length, t("Connecteurs", "Connectors")],
          [certificates.length, t("Certificats", "Certificates")],
          [
            dormant.length,
            t("Comptes dormants (90 j)", "Dormant accounts (90d)"),
          ],
          [stale.length, t("Groupes non synchronisés", "Stale groups")],
          [
            data.activeSessions || 0,
            t("Sessions admin actives", "Active sessions"),
          ],
        ].map(([value, label]) => (
          <article key={String(label)}>
            <strong>{String(value)}</strong>
            <span>{String(label)}</span>
          </article>
        ))}
      </div>
      <div className="identity-health-grid">
        <section>
          <h2>{t("État des connecteurs", "Connector status")}</h2>
          {connections.length ? (
            <ul>
              {connections.map((connection) => (
                <li key={String(connection.id)}>
                  <strong>{String(connection.name)}</strong>
                  <span>
                    {String(connection.protocol)} ·{" "}
                    {connection.enabled
                      ? t("Activé", "Enabled")
                      : t("Désactivé", "Disabled")}
                  </span>
                  <small>
                    {t("Dernier test : ", "Last test: ")}
                    {String(
                      connection.lastTestStatus || t("Inconnu", "Unknown"),
                    )}
                    {" · "}
                    {formatDate(connection.lastTestAt)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("Aucun connecteur.", "No connector.")}</p>
          )}
        </section>
        <section>
          <h2>{t("Comptes dormants", "Dormant accounts")}</h2>
          {dormant.length ? (
            <ul>
              {dormant.map((account) => (
                <li key={String(account.id)}>
                  <strong>{String(account.username)}</strong>
                  <span>{String(account.source)}</span>
                  <small>{formatDate(account.lastAuthorizedAt)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("Aucun compte dormant.", "No dormant account.")}</p>
          )}
        </section>
        <section>
          <h2>{t("Groupes à resynchroniser", "Groups to resynchronize")}</h2>
          {stale.length ? (
            <ul>
              {stale.map((group) => (
                <li key={String(group.id)}>
                  <strong>{String(group.name)}</strong>
                  <small>{formatDate(group.lastSyncedAt)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {t("Tous les groupes sont à jour.", "All groups are current.")}
            </p>
          )}
        </section>
        <section>
          <h2>{t("Certificats de confiance", "Trusted certificates")}</h2>
          {certificates.length ? (
            <ul>
              {certificates.map((certificate) => (
                <li key={String(certificate.id)}>
                  <strong>{String(certificate.name)}</strong>
                  <small>
                    {t("Expire le ", "Expires ")}
                    {formatDate(certificate.validTo)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("Aucun certificat.", "No certificate.")}</p>
          )}
        </section>
      </div>
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
            {
              {
                reference: t("Référence", "Reference"),
                title: t("Intitulé", "Title"),
                owner: t("Responsable", "Owner"),
              }[key]
            }
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
              <option key={value} value={value}>
                {statusLabel(locale, value)}
              </option>
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
              {statusLabel(locale, incident.severity)} ·{" "}
              {statusLabel(locale, incident.status)}
            </span>
            <p>
              {incident.owner} ·{" "}
              {new Date(incident.occurredAt).toLocaleString(locale)}
            </p>
            {incident.correctiveActions.map((action) => (
              <small key={action.id}>
                CAPA: {action.description} — {action.owner} —{" "}
                {statusLabel(locale, action.status)}
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
                <option key={value} value={value}>
                  {statusLabel(locale, value)}
                </option>
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
