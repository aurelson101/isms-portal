"use client";

import { FormEvent, useEffect, useState } from "react";

type Locale = "fr" | "en";
type AuthConfig = {
  directoryLoginEnabled: boolean;
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
};

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
    detecting: "Détection de votre session Microsoft en cours…",
    useCredentials: "Utiliser mes identifiants",
    rememberDevice: "Reconnaître cet équipement pendant 14 jours",
    ssoUnavailable:
      "La connexion automatique n’a pas pu être démarrée. Utilisez vos identifiants.",
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
    detecting: "Detecting your Microsoft session…",
    useCredentials: "Use my credentials",
    rememberDevice: "Remember this device for 14 days",
    ssoUnavailable:
      "Automatic sign-in could not be started. Use your credentials.",
  },
} as const;

export default function LoginPage() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [detectingSso, setDetectingSso] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    const preferred: Locale = navigator.language.startsWith("en") ? "en" : "fr";
    setLocale(preferred);
    const parameters = new URLSearchParams(window.location.search);
    const signedOut = parameters.get("loggedout") === "1";
    const localLogin = parameters.get("local") === "1";
    setLoggedOut(signedOut);
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then((config: AuthConfig) => {
        setAvailable(config.directoryLoginEnabled);
        if (
          !config.ssoEnabled ||
          !config.ssoLoginUrl ||
          signedOut ||
          localLogin
        )
          return;

        const ssoUrl = new URL(config.ssoLoginUrl, window.location.origin);
        if (
          ssoUrl.origin !== window.location.origin ||
          !ssoUrl.pathname.startsWith("/oauth2/")
        ) {
          setError(copy[preferred].ssoUnavailable);
          return;
        }

        const requested = parameters.get("return");
        const safeReturn =
          requested?.startsWith("/") && !requested.startsWith("//")
            ? requested
            : "/";
        ssoUrl.searchParams.set("rd", safeReturn);
        setDetectingSso(true);
        window.location.replace(`${ssoUrl.pathname}${ssoUrl.search}`);
      })
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
      body: JSON.stringify({
        login: values.login,
        password: values.password,
        rememberDevice: values.rememberDevice === "on",
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(t.invalid);
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("return");
    window.location.replace(
      requested?.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/",
    );
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
        {detectingSso && (
          <p className="login-success" role="status">
            {t.detecting}
          </p>
        )}
        {!available && <p className="login-warning">{t.unavailable}</p>}
        <form onSubmit={submit} className="login-form" aria-busy={detectingSso}>
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
          <label className="remember-device">
            <input name="rememberDevice" type="checkbox" />
            <span>{t.rememberDevice}</span>
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !available || detectingSso}
          >
            {detectingSso ? t.detecting : busy ? t.busy : t.submit}
          </button>
        </form>
        {detectingSso && (
          <a className="login-back" href="/login?local=1">
            {t.useCredentials}
          </a>
        )}
      </section>
    </main>
  );
}
