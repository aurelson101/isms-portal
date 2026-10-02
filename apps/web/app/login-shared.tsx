"use client";

import { useEffect, useState } from "react";
import { useBranding } from "./branding";
import { initialLocale, rememberLocale, type Locale } from "./i18n/locale";
import type { AuthConfig } from "./auth-navigation";

export function useLoginLocale() {
  const [locale, setLocale] = useState<Locale>("fr");
  useEffect(() => {
    const preferred = initialLocale(localStorage.getItem("isms-locale"));
    setLocale(preferred);
    document.documentElement.lang = preferred;
  }, []);
  const changeLocale = (value: Locale) => { setLocale(value); rememberLocale(value); };
  return [locale, changeLocale] as const;
}

export async function authConfig(signal: AbortSignal): Promise<AuthConfig> {
  const response = await fetch("/api/auth/config", { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Authentication configuration unavailable");
  return response.json();
}

export function loginRequest(endpoint: string, values: Record<string, unknown>) {
  return fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  }).catch(() => null);
}

export function LoginToolbar({ locale, onLocaleChange, admin = false }: {
  locale: Locale; onLocaleChange: (locale: Locale) => void; admin?: boolean;
}) {
  const branding = useBranding();
  return <div className="login-toolbar">
    <div className="login-brand">
      {branding.logoDataUrl ? <img className="brand-logo" src={branding.logoDataUrl} alt="" /> : <span className="login-mark" aria-hidden="true">ISMS</span>}
      <div><strong>{branding.title}</strong><small>{admin
        ? locale === "fr" ? "Administration sécurisée" : "Secure administration"
        : locale === "fr" ? "Portail documentaire" : "Document portal"}</small></div>
    </div>
    <div className="login-language" aria-label={locale === "fr" ? "Langue" : "Language"}>
      {(["fr", "en"] as const).map((value) => <button key={value} type="button" onClick={() => onLocaleChange(value)} aria-pressed={locale === value}>{value.toUpperCase()}</button>)}
    </div>
  </div>;
}
