"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type AuthConfig = {
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  directoryLoginEnabled: boolean;
  localAdminEnabled: boolean;
};
type Locale = "fr" | "en";
type Mode = "directory" | "admin";

const copy = {
  fr: {
    title: "Connexion",
    subtitle:
      "Connectez-vous avec votre identifiant Active Directory court. Votre adresse e-mail et vos groupes détermineront automatiquement les documents accessibles.",
    directory: "Compte Active Directory",
    admin: "Compte administrateur",
    login: "Identifiant AD",
    identifier: "Identifiant",
    loginHint: "Exemple : jdupont — sans domaine ni @entreprise.fr",
    password: "Mot de passe",
    submit: "Se connecter",
    busy: "Connexion…",
    invalidAd:
      "Identifiant ou mot de passe Active Directory incorrect, ou annuaire indisponible.",
    invalidAdmin: "Identifiants ou code MFA incorrects.",
    unavailable: "Le service d’authentification est indisponible.",
    mfa: "Code MFA",
    sso: "Continuer avec Microsoft 365",
    back: "Retour au portail",
    secure:
      "Le mot de passe AD est vérifié par LDAP/LDAPS et n’est jamais stocké.",
    ldapsRequired:
      "La connexion AD sera disponible après activation d’un connecteur LDAPS avec un certificat CA valide.",
    loggedOut: "Vous êtes maintenant déconnecté.",
  },
  en: {
    title: "Sign in",
    subtitle:
      "Sign in with your short Active Directory username. Your email address and groups automatically determine which documents you can access.",
    directory: "Active Directory account",
    admin: "Administrator account",
    login: "AD username",
    identifier: "Username",
    loginHint: "Example: jsmith — without a domain or @company.com",
    password: "Password",
    submit: "Sign in",
    busy: "Signing in…",
    invalidAd:
      "Incorrect Active Directory username or password, or directory unavailable.",
    invalidAdmin: "Incorrect credentials or MFA code.",
    unavailable: "The authentication service is unavailable.",
    mfa: "MFA code",
    sso: "Continue with Microsoft 365",
    back: "Back to portal",
    secure: "The AD password is verified by LDAP/LDAPS and is never stored.",
    ldapsRequired:
      "AD sign-in will be available after an LDAPS connector with a valid CA certificate is enabled.",
    loggedOut: "You are now signed out.",
  },
} as const;

export default function LoginPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [locale, setLocale] = useState<Locale>("fr");
  const [mode, setMode] = useState<Mode>("directory");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setLoggedOut(query.get("loggedout") === "1");
    const preferred: Locale = navigator.language.startsWith("en") ? "en" : "fr";
    setLocale(preferred);
    if (query.get("fallback") === "admin") setMode("admin");
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then((value: AuthConfig) => {
        setConfig(value);
        if (!value.directoryLoginEnabled) setMode("admin");
      })
      .catch(() => setError(copy[preferred].unavailable));
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(
      mode === "directory" ? "/api/auth/directory-login" : "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    ).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      if (mode === "admin") setNeedsMfa(true);
      setError(mode === "directory" ? t.invalidAd : t.invalidAdmin);
      return;
    }
    const requested =
      new URLSearchParams(window.location.search).get("return") ||
      (mode === "directory" ? "/" : "/admin");
    const fallback = mode === "directory" ? "/" : "/admin";
    window.location.assign(requested.startsWith("/") ? requested : fallback);
  };

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-toolbar">
          <div className="login-brand">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>ISMS Portal</strong>
              <small>Active Directory</small>
            </div>
          </div>
          <div className="login-language" aria-label="Language">
            <button
              onClick={() => setLocale("fr")}
              aria-pressed={locale === "fr"}
            >
              FR
            </button>
            <button
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
        </div>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        {loggedOut && (
          <p className="login-success" role="status">
            {t.loggedOut}
          </p>
        )}
        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "directory"}
            disabled={!config?.directoryLoginEnabled}
            onClick={() => {
              setMode("directory");
              setError("");
            }}
          >
            {t.directory}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "admin"}
            onClick={() => {
              setMode("admin");
              setError("");
            }}
          >
            {t.admin}
          </button>
        </div>
        {config && !config.directoryLoginEnabled && (
          <p className="login-warning" role="status">
            {t.ldapsRequired}
          </p>
        )}
        <form onSubmit={submit} className="login-form">
          <label>
            {mode === "directory" ? t.login : t.identifier}
            <input
              name={mode === "directory" ? "login" : "username"}
              required
              autoComplete="username"
              maxLength={160}
            />
            {mode === "directory" && <small>{t.loginHint}</small>}
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
          {mode === "admin" && needsMfa && (
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
        {mode === "directory" && <p className="login-security">✓ {t.secure}</p>}
        {config?.ssoEnabled && config.ssoLoginUrl && (
          <>
            <div className="login-divider">
              <span>SSO</span>
            </div>
            <a className="button-link primary" href={config.ssoLoginUrl}>
              {t.sso}
            </a>
          </>
        )}
        <Link className="login-back" href="/">
          ← {t.back}
        </Link>
      </section>
    </main>
  );
}
