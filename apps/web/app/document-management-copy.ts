import type { Locale } from "./i18n/locale";
const text = {
  advanced: [
    "Recherche GED",
    "GED search",
    "Búsqueda documental",
    "Vyhľadávanie dokumentov",
  ],
  reference: ["Référence", "Reference", "Referencia", "Referencia"],
  owner: ["Responsable", "Owner", "Responsable", "Vlastník"],
  documentType: [
    "Type de document",
    "Document type",
    "Tipo de documento",
    "Typ dokumentu",
  ],
  keywords: ["Mots-clés", "Keywords", "Palabras clave", "Kľúčové slová"],
  reviewFrom: [
    "Échéance à partir du",
    "Review date from",
    "Revisión desde",
    "Dátum kontroly od",
  ],
  reviewTo: [
    "Échéance jusqu’au",
    "Review date to",
    "Revisión hasta",
    "Dátum kontroly do",
  ],
  apply: ["Appliquer", "Apply", "Aplicar", "Použiť"],
  reset: ["Réinitialiser", "Reset", "Restablecer", "Obnoviť"],
  all: ["Tous", "All", "Todos", "Všetky"],
  bulk: [
    "Modifier un lot de métadonnées",
    "Bulk metadata editing",
    "Editar metadatos en lote",
    "Hromadná úprava metadát",
  ],
  select: [
    "Sélection de la page courante (50 maximum)",
    "Select from the current page (maximum 50)",
    "Seleccionar en la página actual (máximo 50)",
    "Vyberte na aktuálnej stránke (najviac 50)",
  ],
  category: [
    "Catégorie cible",
    "Target category",
    "Categoría de destino",
    "Cieľová kategória",
  ],
  keep: [
    "Conserver les catégories",
    "Keep categories",
    "Conservar categorías",
    "Zachovať kategórie",
  ],
  none: ["Sans catégorie", "No category", "Sin categoría", "Bez kategórie"],
  preview: [
    "Prévisualiser les changements",
    "Preview changes",
    "Vista previa de cambios",
    "Ukážka zmien",
  ],
  confirm: [
    "Confirmer le lot",
    "Confirm batch",
    "Confirmar lote",
    "Potvrdiť dávku",
  ],
  saved: [
    "Modifications enregistrées.",
    "Changes saved.",
    "Cambios guardados.",
    "Zmeny boli uložené.",
  ],
  history: [
    "Historique des modifications",
    "Change history",
    "Historial de cambios",
    "História zmien",
  ],
  next: ["Suivant", "Next", "Siguiente", "Ďalej"],
  previous: ["Précédent", "Previous", "Anterior", "Späť"],
  empty: [
    "Aucune modification enregistrée.",
    "No recorded changes.",
    "No hay cambios registrados.",
    "Žiadne zaznamenané zmeny.",
  ],
  quality: [
    "Suivi documentaire",
    "Document follow-up",
    "Seguimiento documental",
    "Sledovanie dokumentov",
  ],
  missingOwner: [
    "Sans responsable",
    "Missing owner",
    "Sin responsable",
    "Bez vlastníka",
  ],
  incomplete: [
    "Champs conseillés non renseignés (facultatifs)",
    "Recommended fields missing (optional)",
    "Campos recomendados vacíos (opcionales)",
    "Chýbajúce odporúčané polia (voliteľné)",
  ],
  overdueReviews: [
    "Revues en retard",
    "Overdue reviews",
    "Revisiones atrasadas",
    "Oneskorené kontroly",
  ],
  reminders: [
    "Configurer les rappels",
    "Configure reminders",
    "Configurar recordatorios",
    "Nastaviť pripomienky",
  ],
  enabled: [
    "Activer les rappels",
    "Enable reminders",
    "Activar recordatorios",
    "Povoliť pripomienky",
  ],
  leadDays: [
    "Rappel avant échéance (jours)",
    "Reminder before due date (days)",
    "Recordatorio antes del vencimiento (días)",
    "Pripomienka pred termínom (dni)",
  ],
  overdueDays: [
    "Alerte après échéance (jours)",
    "Overdue alert delay (days)",
    "Alerta tras el vencimiento (días)",
    "Oneskorená pripomienka (dni)",
  ],
  publicationRepeatDays: [
    "Répéter les revues de publication (jours, 0 = une fois)",
    "Repeat publication review reminders (days, 0 = once)",
    "Repetir recordatorios de publicación (días, 0 = una vez)",
    "Opakovať pripomienky publikácie (dni, 0 = raz)",
  ],
  duplicate: [
    "Ce fichier existe déjà. Le dépôt a été interrompu.",
    "This file already exists. The upload was stopped.",
    "Este archivo ya existe. Se ha detenido la carga.",
    "Tento súbor už existuje. Nahrávanie bolo zastavené.",
  ],
  open: [
    "Ouvrir le document existant",
    "Open existing document",
    "Abrir documento existente",
    "Otvoriť existujúci dokument",
  ],
  version: [
    "Gérer une nouvelle version",
    "Manage a new version",
    "Gestionar una nueva versión",
    "Spravovať novú verziu",
  ],
  close: ["Fermer", "Close", "Cerrar", "Zavrieť"],
} as const;
export function documentLabel(locale: Locale, key: keyof typeof text) {
  return text[key][{ fr: 0, en: 1, es: 2, sk: 3 }[locale]];
}
export const metadataFilterKeys = [
  "reference",
  "owner",
  "documentType",
  "keywords",
  "reviewFrom",
  "reviewTo",
] as const;
export type MetadataFilters = Partial<
  Record<(typeof metadataFilterKeys)[number], string>
>;
export function readMetadataFilters(
  parameters: URLSearchParams,
): MetadataFilters {
  return Object.fromEntries(
    metadataFilterKeys
      .map((key) => [key, (parameters.get(key) || "").slice(0, 200)])
      .filter(([, value]) => value),
  );
}
