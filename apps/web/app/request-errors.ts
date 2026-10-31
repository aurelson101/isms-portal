import { readLocale } from "./i18n/locale";
import { documentLabel } from "./document-management-copy";

export async function responseMessage(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  const code =
    body && typeof body === "object" && "code" in body ? body.code : null;
  if (code === "DOCUMENT_DUPLICATE") {
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("isms:duplicate-upload", { detail: body }),
      );
    return documentLabel(readLocale(), "duplicate");
  }
  if (code === "DOCUMENT_CHANGED")
    return {
      fr: "Le document a changé. Vos champs sont conservés ; rouvrez l'éditeur pour comparer avant d'enregistrer.",
      en: "The document changed. Your fields are preserved; reopen the editor to compare before saving.",
      es: "El documento ha cambiado. Sus campos se conservan; vuelva a abrir el editor para comparar antes de guardar.",
      sk: "Dokument sa zmenil. Vaše polia sú zachované; pred uložením znova otvorte editor a porovnajte zmeny.",
    }[readLocale()];
  const message =
    body && typeof body === "object" && "message" in body ? body.message : null;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message)) {
    const text = message
      .filter((item): item is string => typeof item === "string")
      .join(". ");
    if (text) return text;
  }
  const messages: Record<
    number,
    Record<ReturnType<typeof readLocale>, string>
  > = {
    401: {
      fr: "Session expirée. Reconnectez-vous.",
      en: "Session expired. Sign in again.",
      es: "Sesión caducada. Inicie sesión de nuevo.",
      sk: "Relácia vypršala. Prihláste sa znova.",
    },
    403: {
      fr: "Droits insuffisants pour cette action.",
      en: "You do not have permission for this action.",
      es: "No tiene permiso para esta acción.",
      sk: "Na túto akciu nemáte oprávnenie.",
    },
    413: {
      fr: "Le fichier dépasse la taille autorisée.",
      en: "The file exceeds the permitted size.",
      es: "El archivo supera el tamaño permitido.",
      sk: "Súbor prekračuje povolenú veľkosť.",
    },
    503: {
      fr: "Service temporairement indisponible. Réessayez plus tard.",
      en: "Service temporarily unavailable. Try again later.",
      es: "Servicio temporalmente no disponible. Inténtelo más tarde.",
      sk: "Služba je dočasne nedostupná. Skúste to neskôr.",
    },
  };
  return messages[response.status]?.[readLocale()] || fallback;
}
