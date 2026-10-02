"use client";

import { FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { returnDestination, ssoDestination } from "../../auth-navigation";
import { authConfig, loginFailure, loginRequest, LoginToolbar, PasswordField } from "../../login-shared";
import { useInterfaceLocale } from "../../i18n/use-locale";

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
  const [locale, setLocale] = useInterfaceLocale();
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [mode, setMode] = useState<LoginMode>("local");
  const [directoryAvailable, setDirectoryAvailable] = useState(false);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null);
  const t = copy[locale];
  const selectMode = (value: LoginMode) => { setMode(value); setNeedsMfa(false); setError(""); };
  const navigateTabs = (event: KeyboardEvent<HTMLDivElement>) => {
    if (busy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "local" : event.key === "End" ? "directory" : mode === "local" ? "directory" : "local";
    selectMode(next);
    document.getElementById(`admin-${next}-tab`)?.focus();
  };

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
    values.username = String(values.username || "").trim();
    const response = await loginRequest(
      mode === "local" ? "/api/auth/login" : "/api/auth/directory-login",
      mode === "local" ? values : { login: values.username, password: values.password },
    );
    submitting.current = false;
    setBusy(false);
    if (!response?.ok) {
      setNeedsMfa(mode === "local" && response?.status === 401);
      setError(loginFailure(response, locale, t.invalid));
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
        <div className="login-tabs" role="tablist" aria-label={t.title} onKeyDown={navigateTabs}>
          <button
            type="button"
            role="tab"
            id="admin-local-tab"
            aria-controls="admin-login-panel"
            tabIndex={mode === "local" ? 0 : -1}
            disabled={busy}
            aria-selected={mode === "local"}
            onClick={() => selectMode("local")}
          >
            {t.localMode}
          </button>
          <button
            type="button"
            role="tab"
            id="admin-directory-tab"
            aria-controls="admin-login-panel"
            tabIndex={mode === "directory" ? 0 : -1}
            disabled={busy}
            aria-selected={mode === "directory"}
            onClick={() => selectMode("directory")}
          >
            {t.directoryMode}
          </button>
        </div>
        {mode === "directory" && !directoryAvailable && (
          <p className="login-warning">{t.directoryUnavailable}</p>
        )}
        <form onSubmit={submit} className="login-form" aria-busy={busy} id="admin-login-panel" role="tabpanel" aria-labelledby={`admin-${mode}-tab`}>
          <fieldset className="login-fields" disabled={busy}>
          <label>
            {t.identifier}
            <input
              name="username"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={160}
            />
          </label>
          <PasswordField locale={locale} label={t.password} />
          {mode === "local" && needsMfa && (
            <label>
              {t.mfa}
              <input
                name="mfaCode"
                autoFocus
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
          </fieldset>
        </form>
      </section>
    </main>
  );
}
