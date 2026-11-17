"use client";
import { useState } from "react";
import type { Locale } from "./i18n/locale";
import { fetchWithTimeout as fetch } from "./http-client";
type Traces = {
  available: boolean;
  reason: string | null;
  truncated: boolean;
  items: Array<{
    id: string;
    recipientAddress: string;
    subject: string;
    status: string;
    receivedDateTime: string;
  }>;
};
const copy = {
  fr: {
    title: "Traces Exchange (48 heures)",
    load: "Vérifier les traces Exchange",
    note: "Messages de l’expéditeur Graph configuré uniquement. Les traces ne prouvent pas la lecture et ne sont pas reliées automatiquement aux tâches ISMS.",
    unavailable:
      "Traces indisponibles. Vérifiez la configuration Graph et l’autorisation ExchangeMessageTrace.Read.All. Aucun droit supplémentaire n’est accordé par ce bouton.",
    empty:
      "Aucune trace disponible pour cette période. Cela ne prouve pas une absence d’envoi.",
    partial:
      "Résultats limités à 100 traces. Utilisez Exchange pour la liste complète.",
    recipient: "Destinataire",
    subject: "Objet",
    status: "État fournisseur",
    at: "Date",
  },
  en: {
    title: "Exchange traces (48 hours)",
    load: "Check Exchange traces",
    note: "Configured Graph sender only. Traces do not prove reading and are not automatically matched to ISMS jobs.",
    unavailable:
      "Traces unavailable. Check Graph configuration and ExchangeMessageTrace.Read.All permission. This button never grants additional permissions.",
    empty:
      "No traces available for this period. This does not prove that no messages were sent.",
    partial: "Limited to 100 traces. Use Exchange for the full list.",
    recipient: "Recipient",
    subject: "Subject",
    status: "Provider status",
    at: "Date",
  },
  es: {
    title: "Trazas de Exchange (48 horas)",
    load: "Consultar trazas de Exchange",
    note: "Solo el remitente de Graph configurado. Las trazas no prueban la lectura ni se vinculan automáticamente a las tareas ISMS.",
    unavailable:
      "Trazas no disponibles. Compruebe Graph y el permiso ExchangeMessageTrace.Read.All. Este botón no concede permisos.",
    empty:
      "No hay trazas para este período. Esto no demuestra que no se enviaran mensajes.",
    partial: "Límite de 100 trazas. Consulte Exchange para la lista completa.",
    recipient: "Destinatario",
    subject: "Asunto",
    status: "Estado del proveedor",
    at: "Fecha",
  },
  sk: {
    title: "Záznamy Exchange (48 hodín)",
    load: "Overiť záznamy Exchange",
    note: "Len nakonfigurovaný odosielateľ Graph. Záznamy nepotvrdzujú prečítanie a automaticky sa nespájajú s úlohami ISMS.",
    unavailable:
      "Záznamy nie sú dostupné. Overte Graph a oprávnenie ExchangeMessageTrace.Read.All. Toto tlačidlo neudeľuje oprávnenia.",
    empty:
      "Pre toto obdobie nie sú dostupné záznamy. Neznamená to, že neboli odoslané správy.",
    partial: "Najviac 100 záznamov. Úplný zoznam nájdete v Exchange.",
    recipient: "Príjemca",
    subject: "Predmet",
    status: "Stav poskytovateľa",
    at: "Dátum",
  },
};
export function EmailTraces({ locale }: { locale: Locale }) {
  const [result, setResult] = useState<Traces | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const text = copy[locale];
  return (
    <details className="email-traces">
      <summary>{text.title}</summary>
      <p className="muted">{text.note}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          setResult(null);
          try {
            const response = await fetch("/api/admin/operations/email-traces", {
              cache: "no-store",
            });
            if (!response.ok) throw new Error();
            const data = (await response.json()) as Traces;
            if (
              typeof data.available !== "boolean" ||
              !Array.isArray(data.items)
            )
              throw new Error();
            setResult(data);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {text.load}
      </button>
      {(error || result?.available === false) && (
        <p role="status">{text.unavailable}</p>
      )}
      {result?.available && (
        <>
          <p role="status">
            {result.truncated
              ? text.partial
              : result.items.length
                ? ""
                : text.empty}
          </p>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{text.recipient}</th>
                  <th>{text.subject}</th>
                  <th>{text.status}</th>
                  <th>{text.at}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{item.recipientAddress}</td>
                    <td>{item.subject}</td>
                    <td>{item.status}</td>
                    <td>
                      {new Date(item.receivedDateTime).toLocaleString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  );
}
