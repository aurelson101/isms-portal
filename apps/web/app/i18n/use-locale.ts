"use client";

import { useEffect, useState } from "react";
import { initialLocale, isLocale, readLocale, rememberLocale, type Locale } from "./locale";

export function useInterfaceLocale() {
  const [locale, setLocale] = useState<Locale>("fr");
  useEffect(() => {
    const apply = (value: Locale) => { setLocale(value); document.documentElement.lang = value; };
    apply(readLocale());
    const sameTab = (event: Event) => {
      const value = (event as CustomEvent<Locale>).detail;
      if (isLocale(value)) apply(value);
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
      window.removeEventListener("isms-locale", sameTab);
      window.removeEventListener("storage", otherTab);
      window.removeEventListener("languagechange", browserChanged);
    };
  }, []);
  const changeLocale = (value: Locale) => { setLocale(value); rememberLocale(value); };
  return [locale, changeLocale] as const;
}
