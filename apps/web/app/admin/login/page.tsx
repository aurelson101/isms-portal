"use client";

import { FormEvent, useEffect, useState } from "react";
import { useBranding } from "../../branding";
import { initialLocale, rememberLocale, type Locale } from "../../i18n/locale";

type LoginMode = "local" | "directory";
const copy = {
  fr: {
    title: "Connexion administrateur",
    subtitle: "Accès réservé à l’administration du portail.",
    identifier: "Identifiant administrateur",
    password: "Mot de passe",
    mfa: "Code MFA",
    submit: "Se connecter à l’administration",
    busy: "Connexion…",
    invalid: "Identifiants ou code MFA incorrects.",
    loggedOut: "La session administrateur est fermée.",
    localMode: "Compte local",
    directoryMode: "Active Directory",
    directoryUnavailable: "La connexion Active Directory est indisponible.",
  },
  en: {
    title: "Administrator sign in",
    subtitle: "Restricted access to portal administration.",
    identifier: "Administrator username",
    password: "Password",
    mfa: "MFA code",
    submit: "Sign in to administration",
    busy: "Signing in…",
    invalid: "Incorrect credentials or MFA code.",
    loggedOut: "The administrator session is closed.",
    localMode: "Local account",
    directoryMode: "Active Directory",
    directoryUnavailable: "Active Directory sign-in is unavailable.",
  },
} as const;

export default function AdminLoginPage() {
  const branding = useBranding();
  const [locale, setLocale] = useState<Locale>("fr");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [mode, setMode] = useState<LoginMode>("local");
  const [directoryAvailable, setDirectoryAvailable] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    const preferred = initialLocale(localStorage.getItem("isms-locale"));
    setLocale(preferred);
    document.documentElement.lang = preferred;
    setLoggedOut(
      new URLSearchParams(window.location.search).get("loggedout") === "1",
    );
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then((config: { directoryLoginEnabled?: boolean }) =>
        setDirectoryAvailable(Boolean(config.directoryLoginEnabled)),
      )
      .catch(() => setDirectoryAvailable(false));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(
      mode === "local" ? "/api/auth/login" : "/api/auth/directory-login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "local"
            ? values
            : { login: values.username, password: values.password },
        ),
      },
    ).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setNeedsMfa(mode === "local");
      setError(t.invalid);
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("return");
    window.location.replace(
      requested?.startsWith("/admin") ? requested : "/admin",
    );
  };

  return (
    <main className="login-shell admin-login-shell">
      <section className="login-card">
        <div className="login-toolbar">
          <div className="login-brand">
            {branding.logoDataUrl ? (
              <img className="brand-logo" src={branding.logoDataUrl} alt="" />
            ) : (
              <span aria-hidden="true">◇</span>
            )}
            <div>
              <strong>{branding.title}</strong>
              <small>Administration sécurisée</small>
            </div>
          </div>
          <div className="login-language" aria-label="Language">
            <button
              type="button"
              onClick={() => {
                setLocale("fr");
                rememberLocale("fr");
              }}
              aria-pressed={locale === "fr"}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => {
                setLocale("en");
                rememberLocale("en");
              }}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
        </div>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        {loggedOut && <p className="login-success">{t.loggedOut}</p>}
        <div className="login-tabs" role="tablist" aria-label={t.title}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "local"}
            onClick={() => {
              setMode("local");
              setNeedsMfa(false);
              setError("");
            }}
          >
            {t.localMode}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "directory"}
            onClick={() => {
              setMode("directory");
              setNeedsMfa(false);
              setError("");
            }}
          >
            {t.directoryMode}
          </button>
        </div>
        {mode === "directory" && !directoryAvailable && (
          <p className="login-warning">{t.directoryUnavailable}</p>
        )}
        <form onSubmit={submit} className="login-form">
          <label>
            {t.identifier}
            <input
              name="username"
              required
              autoComplete="username"
              maxLength={160}
            />
          </label>
          <label>
            {t.password}
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {mode === "local" && needsMfa && (
            <label>
              {t.mfa}
              <input
                name="mfaCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || (mode === "directory" && !directoryAvailable)}
          >
            {busy ? t.busy : t.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
