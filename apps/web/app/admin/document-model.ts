export type Space = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  categories?: Category[];
  _count?: { documents: number; accessRules: number };
  ownerGroup?: { id: string; name: string; active: boolean } | null;
};

export type Category = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  spaceId: string;
  parentId?: string | null;
};

export type AdminDocument = {
  id: string;
  metadata?: Record<string, string>;
  status: string;
  sensitive: boolean;
  watermarkPosition: "HEADER" | "CENTER" | "FOOTER";
  translations: Array<{
    locale: string;
    title: string;
    description?: string | null;
  }>;
  space: Space;
  category?: Category;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  versions: Array<{
    id?: string;
    locale: string;
    version: number;
    createdAt: string;
  }>;
};

export function flattenCategories(categories: Category[]) {
  const children = new Map<string | null, Category[]>();
  const categoryIds = new Set(categories.map((item) => item.id));
  for (const item of categories) {
    const parentId =
      item.parentId && categoryIds.has(item.parentId) ? item.parentId : null;
    children.set(parentId, [...(children.get(parentId) || []), item]);
  }
  const result: Array<{ item: Category; depth: number }> = [];
  const appended = new Set<string>();
  const append = (item: Category, depth: number, trail = new Set<string>()) => {
    if (trail.has(item.id) || appended.has(item.id)) return;
    const nextTrail = new Set(trail).add(item.id);
    appended.add(item.id);
    result.push({ item, depth });
    for (const child of children.get(item.id) || [])
      append(child, depth + 1, nextTrail);
  };
  for (const root of children.get(null) || []) append(root, 0);
  for (const item of categories) append(item, 0);
  return result;
}

export const paginationItems = (
  current: number,
  total: number,
): Array<number | "ellipsis"> => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  return [...pages]
    .filter((item) => item >= 1 && item <= total)
    .sort((left, right) => left - right)
    .flatMap((item, index, values) =>
      index && item - values[index - 1] > 1
        ? (["ellipsis" as const, item] as const)
        : ([item] as const),
    );
};
