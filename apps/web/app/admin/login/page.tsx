"use client";

import { FormEvent, useEffect, useState } from "react";

type Locale = "fr" | "en";
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
  },
} as const;

export default function AdminLoginPage() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    setLocale(navigator.language.startsWith("en") ? "en" : "fr");
    setLoggedOut(
      new URLSearchParams(window.location.search).get("loggedout") === "1",
    );
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setNeedsMfa(true);
      setError(t.invalid);
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("return");
    window.location.assign(
      requested?.startsWith("/admin") ? requested : "/admin",
    );
  };

  return (
    <main className="login-shell admin-login-shell">
      <section className="login-card">
        <div className="login-toolbar">
          <div className="login-brand">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>ISMS Portal</strong>
              <small>Administration sécurisée</small>
            </div>
          </div>
          <div className="login-language" aria-label="Language">
            <button
              type="button"
              onClick={() => setLocale("fr")}
              aria-pressed={locale === "fr"}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
        </div>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        {loggedOut && <p className="login-success">{t.loggedOut}</p>}
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
          {needsMfa && (
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
          <button className="primary" disabled={busy}>
            {busy ? t.busy : t.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
