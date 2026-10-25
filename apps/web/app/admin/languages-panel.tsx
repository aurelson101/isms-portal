"use client";

import { useEffect, useState } from "react";
import { api } from "./api-client";
import { useBranding, updateBrandingCache } from "../branding";
import {
  interfaceLocales,
  normalizeLanguageSettings,
  type Locale,
} from "../i18n/locale";
import { languageNames, languageUi } from "../language-controls";

export function LanguagesPanel({ locale }: { locale: Locale }) {
  const branding = useBranding();
  const [value, setValue] = useState(() =>
    normalizeLanguageSettings(branding.languages),
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const t = languageUi[locale];
  useEffect(() => {
    setValue(normalizeLanguageSettings(branding.languages));
  }, [branding.languages]);
  return (
    <section className="admin-card">
      <h1>{t.title}</h1>
      <p>{t.help}</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setResult(null);
          try {
            await api("/api/admin/settings/portal.languages", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(value),
            });
            updateBrandingCache({ ...branding, languages: value });
            setResult("saved");
          } catch {
            setResult("failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="admin-form" disabled={busy}>
          <legend>{t.enabled}</legend>
          {interfaceLocales.map((language) => (
            <label className="check" key={language}>
              <input
                type="checkbox"
                checked={value.enabled.includes(language)}
                disabled={
                  value.enabled.length === 1 && value.enabled.includes(language)
                }
                onChange={(event) => {
                  const enabled = interfaceLocales.filter((item) =>
                    item === language
                      ? event.target.checked
                      : value.enabled.includes(item),
                  );
                  setValue({
                    enabled,
                    defaultLocale: enabled.includes(value.defaultLocale)
                      ? value.defaultLocale
                      : enabled[0],
                  });
                  setResult(null);
                }}
              />
              {languageNames[language]} ({language.toUpperCase()})
            </label>
          ))}
          <label>
            {t.default}
            <select
              value={value.defaultLocale}
              onChange={(event) => {
                setValue({
                  ...value,
                  defaultLocale: event.target.value as Locale,
                });
                setResult(null);
              }}
            >
              {value.enabled.map((language) => (
                <option key={language} value={language}>
                  {languageNames[language]}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit">
            {t.save}
          </button>
        </fieldset>
      </form>
      {result && (
        <p
          role={result === "failed" ? "alert" : "status"}
          className={result === "failed" ? "error-state" : "notice"}
        >
          {t[result]}
        </p>
      )}
    </section>
  );
}
