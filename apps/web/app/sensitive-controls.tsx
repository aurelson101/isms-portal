"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

// True when the signed-in user is designated to create sensitive documents.
function useSensitiveDepositor() {
  const [depositor, setDepositor] = useState(false);
  useEffect(() => {
    void fetch("/api/sensitive/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { depositor?: boolean } | null) =>
        setDepositor(Boolean(data?.depositor)),
      )
      .catch(() => setDepositor(false));
  }, []);
  return depositor;
}

// Checkbox for upload forms; only shown to designated users.
export function SensitiveDepositOption({ locale }: { locale: Locale }) {
  const depositor = useSensitiveDepositor();
  if (!depositor) return null;
  return (
    <label className="check">
      <input name="sensitive" value="true" type="checkbox" />{" "}
      {translate(
        locale,
        "Document sensible (filigrane, partage nominatif uniquement)",
        "Sensitive document (watermarked, shared by name only)",
      )}
    </label>
  );
}

// Lets a designated user mark an existing document as sensitive, or not.
export function SensitivityToggle({
  documentId,
  sensitive,
  linkOnly = false,
  locale,
  onChanged,
}: {
  documentId: string;
  sensitive: boolean;
  linkOnly?: boolean;
  locale: Locale;
  onChanged: () => void | Promise<void>;
}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const depositor = useSensitiveDepositor();
  const [checked, setChecked] = useState(sensitive);
  const [position, setPosition] = useState("CENTER");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => setChecked(sensitive), [sensitive, documentId]);
  if (!depositor || linkOnly) return null;

  const apply = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/sensitivity`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sensitive: checked,
            ...(checked ? { watermarkPosition: position } : {}),
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        throw new Error(
          [body?.message].flat().filter(Boolean).join(" ") ||
            `HTTP ${response.status}`,
        );
      }
      setMessage(t("Enregistré.", "Saved."));
      await onChanged();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="sensitivity-toggle">
      <legend>{t("Document sensible", "Sensitive document")}</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />{" "}
        {t(
          "Document sensible (filigrane, partage nominatif uniquement)",
          "Sensitive document (watermarked, shared by name only)",
        )}
      </label>
      {checked && (
        <label>
          {t("Position du filigrane", "Watermark position")}
          <select
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          >
            <option value="HEADER">{t("Haut de page", "Page header")}</option>
            <option value="CENTER">{t("Milieu de page", "Page middle")}</option>
            <option value="FOOTER">{t("Bas de page", "Page footer")}</option>
          </select>
        </label>
      )}
      <button
        type="button"
        disabled={busy || checked === sensitive}
        onClick={() => void apply()}
      >
        {t("Appliquer", "Apply")}
      </button>
      {message && <p role="status">{message}</p>}
    </fieldset>
  );
}
