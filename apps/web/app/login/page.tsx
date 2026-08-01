"use client";

import { FormEvent, useEffect, useState } from "react";

type Locale = "fr" | "en";
type AuthConfig = { directoryLoginEnabled: boolean };

const copy = {
  fr: {
    title: "Connexion",
    subtitle: "Saisissez vos identifiants pour accéder à vos documents.",
    identifier: "Identifiant",
    password: "Mot de passe",
    submit: "Se connecter",
    busy: "Connexion…",
    invalid: "Identifiant ou mot de passe incorrect.",
    unavailable:
      "La connexion utilisateur est temporairement indisponible. Contactez votre administrateur.",
    loggedOut: "Vous êtes maintenant déconnecté.",
  },
  en: {
    title: "Sign in",
    subtitle: "Enter your credentials to access your documents.",
    identifier: "Identifier",
    password: "Password",
    submit: "Sign in",
    busy: "Signing in…",
    invalid: "Incorrect username or password.",
    unavailable:
      "User sign-in is temporarily unavailable. Contact your administrator.",
    loggedOut: "You are now signed out.",
  },
} as const;

export default function LoginPage() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    const preferred: Locale = navigator.language.startsWith("en") ? "en" : "fr";
    setLocale(preferred);
    setLoggedOut(
      new URLSearchParams(window.location.search).get("loggedout") === "1",
    );
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then((config: AuthConfig) => setAvailable(config.directoryLoginEnabled))
      .catch(() => setAvailable(false));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch("/api/auth/directory-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(t.invalid);
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("return");
    window.location.assign(requested?.startsWith("/") ? requested : "/");
  };

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-toolbar">
          <div className="login-brand">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>ISMS Portal</strong>
              <small>Portail documentaire</small>
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
        {!available && <p className="login-warning">{t.unavailable}</p>}
        <form onSubmit={submit} className="login-form">
          <label>
            {t.identifier}
            <input
              name="login"
              required
              autoComplete="username"
              maxLength={128}
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
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy || !available}>
            {busy ? t.busy : t.submit}
          </button>
        </form>
      </section>
    </main>
  );
}
