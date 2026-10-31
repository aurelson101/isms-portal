"use client";

import { useEffect, useRef, useState } from "react";
import { useBranding } from "./branding";
import { fetchWithTimeout } from "./http-client";
import {
  interfaceLocales,
  isLocale,
  normalizeLanguageSettings,
  type Locale,
} from "./i18n/locale";

export const languageUi = {
  fr: {
    title: "Langues",
    enabled: "Langues disponibles",
    default: "Langue par défaut du portail",
    profile: "Langue par défaut de mon interface",
    help: "Les langues désactivées sont masquées dans l’interface et les nouveaux dépôts. Les documents existants restent consultables.",
    save: "Enregistrer",
    saved: "Langues enregistrées.",
    failed: "Impossible d’enregistrer les langues.",
  },
  en: {
    title: "Languages",
    enabled: "Available languages",
    default: "Portal default language",
    profile: "My default interface language",
    help: "Disabled languages are hidden from the interface and new uploads. Existing documents remain readable.",
    save: "Save",
    saved: "Languages saved.",
    failed: "Unable to save languages.",
  },
  es: {
    title: "Idiomas",
    enabled: "Idiomas disponibles",
    default: "Idioma predeterminado del portal",
    profile: "Mi idioma de interfaz predeterminado",
    help: "Los idiomas desactivados se ocultan en la interfaz y en las nuevas cargas. Los documentos existentes siguen siendo legibles.",
    save: "Guardar",
    saved: "Idiomas guardados.",
    failed: "No se pudieron guardar los idiomas.",
  },
  sk: {
    title: "Jazyky",
    enabled: "Dostupné jazyky",
    default: "Predvolený jazyk portálu",
    profile: "Môj predvolený jazyk rozhrania",
    help: "Vypnuté jazyky sa nezobrazujú v rozhraní ani pri novom nahrávaní. Existujúce dokumenty zostávajú čitateľné.",
    save: "Uložiť",
    saved: "Jazyky boli uložené.",
    failed: "Jazyky sa nepodarilo uložiť.",
  },
};
export const languageNames: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  sk: "Slovenčina",
};
export const useLanguageSettings = () =>
  normalizeLanguageSettings(useBranding().languages);

export function LanguageButtons({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  const { enabled } = useLanguageSettings();
  return (
    <>
      {enabled.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={locale === value}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </>
  );
}

export function LanguageSelect({
  value,
  defaultValue = "fr",
  onValueChange,
  preserveCurrent = false,
  syncValue = true,
  ...props
}: {
  value?: Locale;
  defaultValue?: string;
  onValueChange?: (value: Locale) => void;
  preserveCurrent?: boolean;
  syncValue?: boolean;
  name?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const { enabled } = useLanguageSettings();
  const [selected, setSelected] = useState(defaultValue);
  const current = value ?? selected;
  const options =
    preserveCurrent && isLocale(current) && !enabled.includes(current)
      ? interfaceLocales.filter(
          (locale) => enabled.includes(locale) || locale === current,
        )
      : enabled;
  const effective = options.find((locale) => locale === current) || options[0];
  useEffect(() => {
    if (syncValue && value && value !== effective) onValueChange?.(effective);
  }, [value, effective, onValueChange, syncValue]);
  return (
    <select
      {...props}
      value={effective}
      onChange={(event) => {
        const next = event.target.value as Locale;
        setSelected(next);
        onValueChange?.(next);
      }}
    >
      {options.map((locale) => (
        <option key={locale} value={locale}>
          {languageNames[locale]} ({locale.toUpperCase()})
        </option>
      ))}
    </select>
  );
}

export function ProfileLanguage({
  locale,
  defaultLocale,
  onChange,
}: {
  locale: Locale;
  defaultLocale?: Locale | null;
  onChange: (locale: Locale) => void;
}) {
  const { enabled } = useLanguageSettings();
  const preferred =
    defaultLocale && enabled.includes(defaultLocale) ? defaultLocale : locale;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const pending = useRef(false);
  const save = async (next: Locale) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetchWithTimeout("/api/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (!response.ok) throw new Error("Language preference was not saved");
      onChange(next);
      setResult("saved");
    } catch {
      setResult("failed");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="admin-form profile-language" aria-busy={busy}>
      <label>
        {languageUi[locale].profile}
        <LanguageSelect
          value={preferred}
          syncValue={false}
          disabled={busy}
          onValueChange={(next) => void save(next)}
        />
      </label>
      {result && (
        <small
          role={result === "failed" ? "alert" : "status"}
          className={result === "failed" ? "error-state" : "notice"}
        >
          {languageUi[locale][result]}
        </small>
      )}
    </div>
  );
}
