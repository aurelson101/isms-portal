import type { Locale } from "./i18n/locale";

type PublicationDocument = {
  translations: Array<{ locale: string; title: string }>;
  versions: Array<{ locale: string }>;
  externalUrl?: string | null;
  space: { nameFr: string; nameEn: string };
  category?: { nameFr: string; nameEn: string } | null;
  suppressEmailNotifications?: boolean;
};

const copy = {
  fr: [
    "Confirmer la publication ?",
    "Titre",
    "Langue(s)",
    "Emplacement",
    "Notifications e-mail",
    "Désactivées",
    "Selon les ACL et le workflow configuré",
  ],
  en: [
    "Confirm publication?",
    "Title",
    "Language(s)",
    "Location",
    "Email notifications",
    "Disabled",
    "According to ACLs and the configured workflow",
  ],
  es: [
    "¿Confirmar publicación?",
    "Título",
    "Idioma(s)",
    "Ubicación",
    "Notificaciones por correo",
    "Desactivadas",
    "Según los permisos y el flujo configurado",
  ],
  sk: [
    "Potvrdiť publikovanie?",
    "Názov",
    "Jazyk(y)",
    "Umiestnenie",
    "E-mailové upozornenia",
    "Vypnuté",
    "Podľa oprávnení a nastaveného pracovného postupu",
  ],
};

export function publicationSummary(
  document: PublicationDocument,
  locale: Locale,
) {
  const labels = copy[locale];
  const title =
    document.translations.find((item) => item.locale === locale)?.title ||
    document.translations[0]?.title ||
    "—";
  const languages = [
    ...new Set(
      (document.externalUrl && !document.versions.length
        ? document.translations
        : document.versions
      ).map((item) => item.locale.toUpperCase()),
    ),
  ];
  const name = (item: { nameFr: string; nameEn: string }) =>
    locale === "fr" ? item.nameFr || item.nameEn : item.nameEn || item.nameFr;
  return [
    labels[0],
    `${labels[1]}: ${title}`,
    `${labels[2]}: ${languages.join(", ") || "—"}`,
    `${labels[3]}: ${[name(document.space), document.category && name(document.category)].filter(Boolean).join(" / ")}`,
    `${labels[4]}: ${document.suppressEmailNotifications ? labels[5] : labels[6]}`,
  ].join("\n\n");
}
