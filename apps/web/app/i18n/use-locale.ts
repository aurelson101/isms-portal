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
    };
    window.addEventListener("isms-locale", sameTab);
    window.addEventListener("storage", otherTab);
    return () => {
      window.removeEventListener("isms-locale", sameTab);
      window.removeEventListener("storage", otherTab);
    };
  }, []);
  const changeLocale = (value: Locale) => { setLocale(value); rememberLocale(value); };
  return [locale, changeLocale] as const;
}
