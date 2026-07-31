"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type AuthConfig = {
  ssoEnabled: boolean;
  ssoLoginUrl: string | null;
  localAdminEnabled: boolean;
};

export default function LoginPage() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((response) => response.json())
      .then((value: AuthConfig) => {
        setConfig(value);
        const query = new URLSearchParams(window.location.search);
        if (
          value.ssoEnabled &&
          value.ssoLoginUrl &&
          query.get("fallback") !== "admin" &&
          sessionStorage.getItem("isms-sso-attempted") !== "true"
        ) {
          sessionStorage.setItem("isms-sso-attempted", "true");
          window.location.assign(value.ssoLoginUrl);
        }
      })
      .catch(() => setError("Le service d’authentification est indisponible."));
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
      setError("Identifiants ou code MFA incorrects.");
      return;
    }
    const destination =
      new URLSearchParams(window.location.search).get("return") || "/admin";
    window.location.assign(
      destination.startsWith("/") ? destination : "/admin",
    );
  };

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <span aria-hidden="true">◇</span>
          <div>
            <strong>ISMS Portal</strong>
            <small>Administration sécurisée</small>
          </div>
        </div>
        <h1>Connexion</h1>
        <p>
          Votre session Microsoft 365 est utilisée automatiquement lorsqu’elle
          est disponible. Le compte administrateur reste accessible en secours.
        </p>
        {config?.ssoEnabled && config.ssoLoginUrl && (
          <a className="button-link primary" href={config.ssoLoginUrl}>
            Continuer avec Microsoft 365
          </a>
        )}
        <div className="login-divider">
          <span>Compte administrateur</span>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Identifiant
            <input
              name="username"
              required
              autoComplete="username"
              maxLength={160}
            />
          </label>
          <label>
            Mot de passe
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          {needsMfa && (
            <label>
              Code MFA
              <input
                name="mfaCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </label>
          )}
          {error && <p className="error-message">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <Link href="/">Retour au portail</Link>
      </section>
    </main>
  );
}
