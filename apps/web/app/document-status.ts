import type { Locale } from "./i18n/locale";
export const documentStatuses = [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
  "QUARANTINED",
] as const;
const labels: Record<string, Record<Locale, string>> = {
  DRAFT: { fr: "Brouillon", en: "Draft", es: "Borrador", sk: "Koncept" },
  PUBLISHED: {
    fr: "Publié",
    en: "Published",
    es: "Publicado",
    sk: "Zverejnené",
  },
  ARCHIVED: {
    fr: "Archivé",
    en: "Archived",
    es: "Archivado",
    sk: "Archivované",
  },
  QUARANTINED: {
    fr: "En quarantaine",
    en: "Quarantined",
    es: "En cuarentena",
    sk: "V karanténe",
  },
};
export function documentStatusLabel(locale: Locale, status: string) {
  return labels[status]?.[locale] || status;
}
