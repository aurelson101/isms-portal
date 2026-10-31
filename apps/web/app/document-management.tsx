"use client";
import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { responseMessage } from "./request-errors";
import { CustomMetadataFields } from "./document-metadata-fields";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";
import {
  documentLabel,
  metadataFilterKeys,
  type MetadataFilters,
} from "./document-management-copy";
import "./document-management.css";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok)
    throw new Error(await responseMessage(response, "Request failed"));
  return response.json();
}

export function DocumentSearchForm({
  locale,
  value,
  onApply,
}: {
  locale: Locale;
  value: MetadataFilters;
  onApply: (value: MetadataFilters) => void;
}) {
  return (
    <details className="document-management">
      <summary>{documentLabel(locale, "advanced")}</summary>
      <form
        key={JSON.stringify(value)}
        className="document-management-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onApply(
            Object.fromEntries(
              metadataFilterKeys
                .map((key) => [key, String(data.get(key) || "").trim()])
                .filter(([, item]) => item),
            ),
          );
        }}
      >
        {metadataFilterKeys.map((key) => (
          <label key={key}>
            {documentLabel(locale, key)}
            {key === "documentType" ? (
              <select name={key} defaultValue={value[key] || ""}>
                <option value="">{documentLabel(locale, "all")}</option>
                {["policy", "procedure", "guide", "evidence", "record"].map(
                  (type) => (
                    <option key={type} value={type}>
                      {translate(
                        locale,
                        {
                          policy: "Politique",
                          procedure: "Procédure",
                          guide: "Guide",
                          evidence: "Preuve",
                          record: "Enregistrement",
                        }[type]!,
                        {
                          policy: "Policy",
                          procedure: "Procedure",
                          guide: "Guide",
                          evidence: "Evidence",
                          record: "Record",
                        }[type]!,
                      )}
                    </option>
                  ),
                )}
              </select>
            ) : (
              <input
                name={key}
                type={key.startsWith("review") ? "date" : "search"}
                maxLength={200}
                defaultValue={value[key] || ""}
              />
            )}
          </label>
        ))}
        <div className="button-row">
          <button className="primary">{documentLabel(locale, "apply")}</button>
          <button type="button" onClick={() => onApply({})}>
            {documentLabel(locale, "reset")}
          </button>
        </div>
      </form>
    </details>
  );
}

type ManagedDocument = {
  id: string;
  updatedAt?: string;
  space: { id: string };
  metadata?: Record<string, string>;
  permissions?: Record<string, boolean>;
  translations: Array<{ title: string; locale: string }>;
};
type Preview = {
  id: string;
  title: string;
  expectedUpdatedAt: string;
  metadataBefore: Record<string, string> | null;
  metadataAfter: Record<string, string>;
  fields: string[];
  categoryBefore: string | null;
  categoryAfter: string | null;
};

export function DocumentBulkEditor({
  documents,
  locale,
  admin = false,
  onComplete,
}: {
  documents: ManagedDocument[];
  locale: Locale;
  admin?: boolean;
  onComplete: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [category, setCategory] = useState("keep");
  const [categories, setCategories] = useState<
    Array<{ id: string; nameFr: string; nameEn: string }>
  >([]);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editable = documents.filter(
    (document) => admin || document.permissions?.edit,
  );
  const chosen = editable.filter((document) => selected.includes(document.id));
  const commonSpace =
    chosen.length > 0 &&
    chosen.every((document) => document.space.id === chosen[0].space.id);
  const id = commonSpace ? chosen[0].id : "";
  useEffect(() => {
    if (!id) return;
    let active = true;
    void request<Array<{ id: string; nameFr: string; nameEn: string }>>(
      `/api/documents/${encodeURIComponent(id)}/categories`,
    )
      .then((value) => {
        if (active) setCategories(value);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, [id]);
  const patch = {
    documents: chosen.map((document) => ({ id: document.id })),
    metadata,
    ...(category === "keep" ? {} : { categoryId: category || null }),
  };
  return (
    <details className="document-management">
      <summary>{documentLabel(locale, "bulk")}</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (inFlight.current || !chosen.length) return;
          inFlight.current = true;
          setBusy(true);
          setError("");
          setMessage("");
          try {
            if (preview) {
              await request("/api/documents/bulk/apply", {
                ...patch,
                documents: preview.map(({ id, expectedUpdatedAt }) => ({
                  id,
                  expectedUpdatedAt,
                })),
              });
              setPreview(null);
              setSelected([]);
              setMetadata({});
              setCategory("keep");
              setMessage(documentLabel(locale, "saved"));
              await onComplete();
            } else
              setPreview(
                await request<Preview[]>("/api/documents/bulk/preview", patch),
              );
          } catch (reason) {
            setPreview(null);
            setError((reason as Error).message);
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy || !!preview}>
          <legend>{documentLabel(locale, "select")}</legend>
          <div className="document-bulk-selection">
            {editable.map((document) => (
              <label key={document.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(document.id)}
                  disabled={
                    !selected.includes(document.id) && selected.length >= 50
                  }
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...selected, document.id]
                        : selected.filter((id) => id !== document.id),
                    );
                    setCategory("keep");
                  }}
                />
                {document.translations.find((item) => item.locale === locale)
                  ?.title ||
                  document.translations[0]?.title ||
                  document.id}
              </label>
            ))}
          </div>
          <label>
            {documentLabel(locale, "category")}
            <select
              value={category}
              disabled={!commonSpace}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="keep">{documentLabel(locale, "keep")}</option>
              <option value="">{documentLabel(locale, "none")}</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {locale === "fr" ? item.nameFr : item.nameEn}
                </option>
              ))}
            </select>
          </label>
          <CustomMetadataFields
            value={metadata}
            onChange={setMetadata}
            t={(fr, en) => translate(locale, fr, en)}
          />
        </fieldset>
        {preview && (
          <div className="document-bulk-preview" aria-live="polite">
            {preview.map((item) => (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <ul>
                  {item.fields.map((key) => (
                    <li key={key}>
                      <strong>{key}</strong>:{" "}
                      {item.metadataBefore?.[key] || "—"} →{" "}
                      {item.metadataAfter[key] || "—"}
                    </li>
                  ))}
                  {item.categoryBefore !== item.categoryAfter && (
                    <li>
                      {documentLabel(locale, "category")}:{" "}
                      {categories.find(
                        (category) => category.id === item.categoryAfter,
                      )?.nameEn || documentLabel(locale, "none")}
                    </li>
                  )}
                </ul>
              </article>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="error-state">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className="button-row">
          <button
            className="primary"
            disabled={
              busy ||
              !chosen.length ||
              (category === "keep" && !Object.keys(metadata).length)
            }
          >
            {documentLabel(locale, preview ? "confirm" : "preview")}
          </button>
          {preview && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {documentLabel(locale, "close")}
            </button>
          )}
        </div>
      </form>
    </details>
  );
}

type History = {
  page: number;
  total: number;
  items: Array<{
    id: string;
    at: string;
    actor: string;
    action: string;
    fields: string[];
  }>;
};
export function DocumentHistory({
  id,
  locale,
}: {
  id: string;
  locale: Locale;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (page = 1) => {
    setBusy(true);
    setError("");
    try {
      setHistory(
        await request<History>(
          `/api/documents/${encodeURIComponent(id)}/history?page=${page}`,
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details
      className="document-management"
      onToggle={(event) => {
        if (event.currentTarget.open && !history && !busy) void load();
      }}
    >
      <summary>{documentLabel(locale, "history")}</summary>
      {error && <p role="alert">{error}</p>}
      {history && (
        <>
          <ol>
            {history.items.map((item) => (
              <li key={item.id}>
                <time>{new Date(item.at).toLocaleString(locale)}</time> ·{" "}
                <strong>{item.actor}</strong> · {item.action}
                {item.fields.length > 0 && ` · ${item.fields.join(", ")}`}
              </li>
            ))}
          </ol>
          {history.total === 0 && <p>{documentLabel(locale, "empty")}</p>}
          <div className="button-row">
            <button
              type="button"
              disabled={busy || history.page <= 1}
              onClick={() => void load(history.page - 1)}
            >
              {documentLabel(locale, "previous")}
            </button>
            <span>
              {history.page} / {Math.max(1, Math.ceil(history.total / 20))}
            </span>
            <button
              type="button"
              disabled={busy || history.page * 20 >= history.total}
              onClick={() => void load(history.page + 1)}
            >
              {documentLabel(locale, "next")}
            </button>
          </div>
        </>
      )}
    </details>
  );
}

type Reminders = {
  enabled: boolean;
  leadDays: number;
  overdueDays: number;
  publicationRepeatDays: number;
};
export function DocumentQuality({
  locale,
  admin = false,
}: {
  locale: Locale;
  admin?: boolean;
}) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [settings, setSettings] = useState<Reminders | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void request<Record<string, number>>("/api/documents/quality/summary")
      .then((value) => {
        if (active) setCounts(value);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <details className="document-management">
      <summary>{documentLabel(locale, "quality")}</summary>
      {counts && (
        <dl className="document-management-grid">
          {(["missingOwner", "incomplete", "overdueReviews"] as const).map(
            (key) => (
              <div key={key}>
                <dt>{documentLabel(locale, key)}</dt>
                <dd>{counts[key]}</dd>
              </div>
            ),
          )}
        </dl>
      )}
      {admin && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              setSettings(
                await request<Reminders>("/api/documents/quality/reminders"),
              );
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {documentLabel(locale, "reminders")}
        </button>
      )}
      {settings && (
        <form
          className="document-management-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const response = await fetch("/api/documents/quality/reminders", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
              });
              if (!response.ok)
                throw new Error(
                  await responseMessage(response, "Request failed"),
                );
              setSettings(await response.json());
              setMessage(documentLabel(locale, "saved"));
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) =>
                setSettings({ ...settings, enabled: event.target.checked })
              }
            />
            {documentLabel(locale, "enabled")}
          </label>
          {(["leadDays", "overdueDays", "publicationRepeatDays"] as const).map(
            (key) => (
              <label key={key}>
                {documentLabel(locale, key)}
                <input
                  type="number"
                  min={0}
                  max={365}
                  required
                  value={settings[key]}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      [key]: Number(event.target.value),
                    })
                  }
                />
              </label>
            ),
          )}
          <button className="primary" disabled={busy}>
            {documentLabel(locale, "apply")}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error-state">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
