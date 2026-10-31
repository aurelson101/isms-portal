"use client";

import { useEffect, useState } from "react";
import {
  initialLocale,
  isLocale,
  readLocale,
  rememberLocale,
  normalizeLanguageSettings,
  resolveEnabledLocale,
  type Locale,
} from "./locale";
import { useBranding } from "../branding";
import { getPortalIdentity } from "../auth-session";

export function useInterfaceLocale() {
  const [locale, setLocale] = useState<Locale>("fr");
  const branding = useBranding();
  const settings = normalizeLanguageSettings(branding.languages);
  const enabledKey = settings.enabled.join(",");
  const defaultLocale = settings.defaultLocale;
  useEffect(() => {
    let active = true;
    let changed = false;
    const policy = {
      enabled: enabledKey.split(",") as Locale[],
      defaultLocale,
    };
    const apply = (value: Locale) => {
      const next = resolveEnabledLocale(value, policy);
      setLocale(next);
      document.documentElement.lang = next;
    };
    apply(readLocale());
    if (!window.location.pathname.includes("login")) {
      void getPortalIdentity<{ locale?: Locale }>({ force: true })
        .then((identity) => {
          if (active && !changed && isLocale(identity.locale))
            apply(identity.locale);
        })
        .catch(() => undefined);
    }
    const sameTab = (event: Event) => {
      const value = (event as CustomEvent<Locale>).detail;
      if (isLocale(value)) {
        changed = true;
        apply(value);
      }
    };
    const otherTab = (event: StorageEvent) => {
      if (event.key === "isms-locale") apply(initialLocale(event.newValue));
      else if (event.key === null) apply(readLocale());
    };
    const browserChanged = () => apply(readLocale());
    window.addEventListener("isms-locale", sameTab);
    window.addEventListener("storage", otherTab);
    window.addEventListener("languagechange", browserChanged);
    return () => {
      active = false;
      window.removeEventListener("isms-locale", sameTab);
      window.removeEventListener("storage", otherTab);
      window.removeEventListener("languagechange", browserChanged);
    };
  }, [enabledKey, defaultLocale]);
  const changeLocale = (value: Locale) => {
    const next = resolveEnabledLocale(value, settings);
    setLocale(next);
    rememberLocale(next);
  };
  return [locale, changeLocale] as const;
}
