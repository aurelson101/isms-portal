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
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 10000);
  try {
    const response = await fetch("/api/auth/config", { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Authentication configuration unavailable");
    const config = await response.json();
    return {
      directoryLoginEnabled: config?.directoryLoginEnabled === true,
      ssoEnabled: config?.ssoEnabled === true,
      ssoLoginUrl: typeof config?.ssoLoginUrl === "string" ? config.ssoLoginUrl : null,
      ssoPilotUrl: typeof config?.ssoPilotUrl === "string" ? config.ssoPilotUrl : null,
    };
  } finally { window.clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}

export function loginFailure(response: Response | null, locale: Locale, invalid: string) {
  if (!response) return locale === "fr" ? "Connexion interrompue. Réessayez." : "Connection interrupted. Try again.";
  if (response.status === 429) return locale === "fr" ? "Trop de tentatives. Patientez avant de réessayer." : "Too many attempts. Wait before trying again.";
  if (response.status >= 500) return locale === "fr" ? "Service temporairement indisponible. Réessayez." : "Service temporarily unavailable. Try again.";
  return invalid;
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
