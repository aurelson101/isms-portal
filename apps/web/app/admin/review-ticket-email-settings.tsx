"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../i18n/locale";
import { api } from "./api-client";

const copy = {
  fr: {
    title: "E-mail séparé des revues (GLPI)",
    enabled:
      "Envoyer un e-mail séparé pour les revues approuvées et les alertes",
    recipient: "Adresse destinataire",
    hint: "Le message est rédigé en anglais, avec la référence, les détails de la revue et le lien vers ISMS. Il peut créer un ticket dans votre collecteur GLPI.",
    save: "Enregistrer",
    saved: "Configuration des e-mails de revue enregistrée.",
    loading: "Chargement…",
    retry: "Réessayer",
  },
  en: {
    title: "Separate review email (GLPI)",
    enabled: "Send a separate email for approved reviews and review alerts",
    recipient: "Recipient email address",
    hint: "The message is in English and includes the reference, review details and an ISMS link. It can create a ticket through your GLPI mail collector.",
    save: "Save",
    saved: "Review email settings saved.",
    loading: "Loading…",
    retry: "Retry",
  },
  es: {
    title: "Correo separado de revisiones (GLPI)",
    enabled:
      "Enviar un correo separado para las revisiones aprobadas y las alertas",
    recipient: "Correo del destinatario",
    hint: "El mensaje se redacta en inglés e incluye la referencia, los detalles de la revisión y un enlace a ISMS. Puede crear un ticket mediante el receptor de correo GLPI.",
    save: "Guardar",
    saved: "Configuración del correo de revisiones guardada.",
    loading: "Cargando…",
    retry: "Reintentar",
  },
  sk: {
    title: "Samostatný e-mail o revíziách (GLPI)",
    enabled:
      "Odosielať samostatný e-mail o schválených revíziách a upozorneniach",
    recipient: "E-mailová adresa príjemcu",
    hint: "Správa je v angličtine a obsahuje referenciu, podrobnosti revízie a odkaz na ISMS. Cez poštový prijímač GLPI môže vytvoriť tiket.",
    save: "Uložiť",
    saved: "Nastavenia e-mailov o revíziách boli uložené.",
    loading: "Načítava sa…",
    retry: "Skúsiť znova",
  },
};
type Settings = { enabled: boolean; recipient: string };
const url = "/api/admin/governance/review-ticket-email";

export function ReviewTicketEmailSettings({
  locale,
  onNotice,
}: {
  locale: Locale;
  onNotice: (message: string) => void;
}) {
  const t = copy[locale];
  const [settings, setSettings] = useState<Settings>({
    enabled: true,
    recipient: "helpdesk-soc@deftagroup.com",
  });
  const [saved, setSaved] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void api<Settings>(url, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setSettings(value);
          setSaved(value);
        }
      })
      .catch((reason: Error) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [reload]);
  return (
    <section className="admin-card">
      <h2>{t.title}</h2>
      <p>{t.hint}</p>
      {error && <p role="alert">{error}</p>}
      {!saved ? (
        error ? (
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            {t.retry}
          </button>
        ) : (
          <p role="status">{t.loading}</p>
        )
      ) : (
        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const value = await api<Settings>(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...settings,
                  recipient: settings.recipient.trim(),
                }),
              });
              setSettings(value);
              setSaved(value);
              onNotice(t.saved);
            } catch (reason) {
              setError((reason as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              disabled={busy}
              onChange={(event) =>
                setSettings({ ...settings, enabled: event.target.checked })
              }
            />
            {t.enabled}
          </label>
          <label>
            {t.recipient}
            <input
              type="email"
              required
              maxLength={254}
              value={settings.recipient}
              disabled={busy}
              onChange={(event) =>
                setSettings({ ...settings, recipient: event.target.value })
              }
            />
          </label>
          <button
            className="primary"
            type="submit"
            disabled={
              busy ||
              (saved.enabled === settings.enabled &&
                saved.recipient === settings.recipient.trim())
            }
          >
            {t.save}
          </button>
        </form>
      )}
    </section>
  );
}
