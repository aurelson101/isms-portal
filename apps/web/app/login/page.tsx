"use client";

import { withLocales } from "../i18n/translate";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  configuredSsoDestination,
  returnDestination,
  ssoDestination,
} from "../auth-navigation";
import {
  authConfig,
  loginFailure,
  loginRequest,
  LoginMethods,
  LoginToolbar,
  PasswordField,
} from "../login-shared";
import { useInterfaceLocale } from "../i18n/use-locale";
import { readLocale } from "../i18n/locale";

const copy = withLocales({
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
} as const);

export default function LoginPage() {
  const [locale, setLocale] = useInterfaceLocale();
  const submitting = useRef(false);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [localLogin, setLocalLogin] = useState(false);
  const [detectingSso, setDetectingSso] = useState(false);
  const [pilotSsoUrl, setPilotSsoUrl] = useState<string | null>(null);
  const t = copy[locale];

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams(window.location.search);
    const signedOut = parameters.get("loggedout") === "1";
    const localLogin = parameters.get("local") === "1";
    setLoggedOut(signedOut);
    setLocalLogin(localLogin);
    authConfig(controller.signal)
      .then((config) => {
        if (controller.signal.aborted) return;
        setAvailable(config.directoryLoginEnabled);
        setPilotSsoUrl(
          configuredSsoDestination(config, parameters.get("return")),
        );
        if (
          !config.ssoEnabled ||
          !config.ssoLoginUrl ||
          signedOut ||
          localLogin
        )
          return;

        const destination = ssoDestination(
          config.ssoLoginUrl,
          parameters.get("return"),
        );
        if (!destination) {
          setError(copy[readLocale()].ssoUnavailable);
          return;
        }
        setDetectingSso(true);
        window.location.replace(destination);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailable(false);
      });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await loginRequest("/api/auth/directory-login", {
      login: String(values.login || "").trim(),
      password: values.password,
      rememberDevice: values.rememberDevice === "on",
    });
    submitting.current = false;
    setBusy(false);
    if (!response?.ok) {
      setError(loginFailure(response, locale, t.invalid));
      return;
    }
    const requested = new URLSearchParams(window.location.search).get("return");
    window.location.replace(returnDestination(requested));
  };

  return (
    <main className="login-shell">
      <section className="login-card">
        <LoginToolbar locale={locale} onLocaleChange={setLocale} />
        <h1>{t.title}</h1>
        {!pilotSsoUrl && <p>{t.subtitle}</p>}
        {loggedOut && <p className="login-success">{t.loggedOut}</p>}
        {detectingSso && (
          <p className="login-success" role="status">
            {t.detecting}
          </p>
        )}
        <LoginMethods
          locale={locale}
          ssoUrl={detectingSso ? null : pilotSsoUrl}
          showCredentials={localLogin}
        >
          {!available && <p className="login-warning">{t.unavailable}</p>}
          <form
            onSubmit={submit}
            className="login-form"
            aria-busy={busy || detectingSso}
          >
            <fieldset className="login-fields" disabled={busy || detectingSso}>
              <label>
                {t.identifier}
                <input
                  name="login"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={128}
                />
              </label>
              <PasswordField locale={locale} label={t.password} />
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
            </fieldset>
          </form>
        </LoginMethods>
        {detectingSso && (
          <a
            className="login-back"
            href={`/login?local=1&return=${encodeURIComponent(returnDestination(new URLSearchParams(window.location.search).get("return")))}`}
          >
            {t.useCredentials}
          </a>
        )}
      </section>
    </main>
  );
}
