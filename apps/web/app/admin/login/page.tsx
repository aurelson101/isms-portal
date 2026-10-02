"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { returnDestination, ssoDestination } from "../../auth-navigation";
import { authConfig, loginRequest, LoginToolbar, useLoginLocale } from "../../login-shared";

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
    sso: "Continuer avec Microsoft",
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
    sso: "Continue with Microsoft",
  },
} as const;

export default function AdminLoginPage() {
  const [locale, setLocale] = useLoginLocale();
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [mode, setMode] = useState<LoginMode>("local");
  const [directoryAvailable, setDirectoryAvailable] = useState(false);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);
  const t = copy[locale];

  useEffect(() => {
    const controller = new AbortController();
    setLoggedOut(
      new URLSearchParams(window.location.search).get("loggedout") === "1",
    );
    authConfig(controller.signal)
      .then((config) => {
        if (controller.signal.aborted) return;
        setDirectoryAvailable(Boolean(config.directoryLoginEnabled));
        const value = config.ssoPilotUrl || config.ssoLoginUrl;
        if (config.ssoEnabled && value) setSsoUrl(ssoDestination(value, "/admin"));
      })
      .catch(() => { if (!controller.signal.aborted) setDirectoryAvailable(false); });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await loginRequest(
      mode === "local" ? "/api/auth/login" : "/api/auth/directory-login",
      mode === "local" ? values : { login: values.username, password: values.password },
    );
    submitting.current = false;
    setBusy(false);
    if (!response?.ok) {
      setNeedsMfa(mode === "local");
      setError(t.invalid);
      return;
    }
    const requested = returnDestination(new URLSearchParams(window.location.search).get("return"), "/admin");
    window.location.replace(
      requested === "/admin" || requested.startsWith("/admin/") || requested.startsWith("/admin#") || requested.startsWith("/admin?") ? requested : "/admin",
    );
  };

  return (
    <main className="login-shell admin-login-shell">
      <section className="login-card">
        <LoginToolbar locale={locale} onLocaleChange={setLocale} admin />
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        {loggedOut && <p className="login-success">{t.loggedOut}</p>}
        {ssoUrl && <a className="login-sso" href={ssoUrl}>{t.sso}</a>}
        <div className="login-tabs" role="tablist" aria-label={t.title}>
          <button
            type="button"
            role="tab"
            disabled={busy}
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
            disabled={busy}
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
        <form onSubmit={submit} className="login-form" aria-busy={busy}>
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
