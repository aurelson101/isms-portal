import { translate } from "../i18n/translate";
import type { Locale } from "../i18n/locale";

export type Space = { id: string; slug?: string; nameFr: string; nameEn: string; permissions: Record<string, boolean> };
export type Category = { id: string; parentId: string | null; nameFr: string; nameEn: string };
export type ModeratorDocument = {
  id: string; status: string; space: Pick<Space, "id" | "nameFr" | "nameEn">;
  category: Pick<Category, "id" | "nameFr" | "nameEn"> | null;
  translations: Array<{ locale: string; title: string; description: string | null }>;
  versions: Array<{ id: string; locale: string; version: number; createdAt?: string }>;
};
export type { MetadataValues } from "../document-metadata-fields";

export function documentFilters(query: URLSearchParams) {
  const page = Number(query.get("page") || 1);
  const status = query.get("status") || "";
  return {
    page: Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1000000) : 1,
    q: (query.get("q") || "").trim().slice(0, 200),
    space: (query.get("space") || "").slice(0, 200),
    status: ["DRAFT", "PUBLISHED", "ARCHIVED", "QUARANTINED"].includes(status) ? status : "",
  };
}

export function latestVersion<T extends { id?: string; locale: string; version: number; createdAt?: string }>({ versions }: { versions: T[] }) {
  return versions.reduce<T | undefined>((latest, version) => {
    if (!latest) return version;
    const currentDate = Date.parse(version.createdAt || ""), previousDate = Date.parse(latest.createdAt || "");
    if (Number.isFinite(currentDate) && Number.isFinite(previousDate) && currentDate !== previousDate) return currentDate > previousDate ? version : latest;
    return version.version > latest.version ? version : latest;
  }, undefined);
}

export function translationFields(document: { translations: ReadonlyArray<{ locale: string; title: string; description?: string | null }> }, locale: Locale) {
  const selected = document.translations.find((item) => item.locale === locale)
    || document.translations.find((item) => item.locale === "en")
    || document.translations[0];
  return {
    title: selected?.title ?? "",
    description: selected?.description ?? "",
  };
}

export function documentPage(payload: unknown, requestedPage: number) {
  if (Array.isArray(payload)) return { items: payload as ModeratorDocument[], page: 1, totalPages: 1 };
  if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) throw new Error("Invalid document response");
  const data = payload as { items: ModeratorDocument[]; page?: unknown; totalPages?: unknown };
  const totalPages = typeof data.totalPages === "number" && Number.isInteger(data.totalPages) && data.totalPages > 0 ? data.totalPages : 1;
  const page = typeof data.page === "number" && Number.isInteger(data.page) && data.page > 0 ? data.page : requestedPage;
  return { items: data.items, page: Math.min(page, totalPages), totalPages };
}

export function categoryOptions(categories: Category[], locale: Locale) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return categories.map((category) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: Category | undefined = category;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(locale === "fr" ? current.nameFr : current.nameEn);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return { id: category.id, label: names.join(" / ") };
  });
}

export function validateUpload(data: FormData, locale: Locale, options: { requireSummary?: boolean } = {}) {
  const t = (fr: string, en: string) => translate(locale, fr, en);
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) throw new Error(t("Le fichier est vide.", "The file is empty."));
  if (!/\.(pdf|docx|xlsx)$/i.test(file.name)) throw new Error(t("Format non autorisé : PDF, DOCX ou XLSX.", "Unsupported format: PDF, DOCX or XLSX required."));
  if (file.size > 50 * 1024 * 1024) throw new Error(t("Le fichier dépasse 50 Mo.", "The file exceeds 50 MB."));
  if (String(data.get("description") || "").length > 2000) throw new Error(t("Un champ dépasse la longueur autorisée.", "A field exceeds the allowed length."));
  for (const [field, limit] of [["title", 255], ["changeSummary", 2000]] as const) {
    const value = String(data.get(field) || "").trim();
    if (!value && (field === "title" || options.requireSummary !== false)) throw new Error(t("Le titre et le résumé des changements sont obligatoires.", "Title and change summary are required."));
    if (value.length > limit) throw new Error(t("Un champ dépasse la longueur autorisée.", "A field exceeds the allowed length."));
    data.set(field, value);
  }
  return data;
}
