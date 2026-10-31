import type { Prisma } from "@prisma/client";

export type CategoryScope = {
  id: string;
  aclRoot?: boolean;
  aclCategories?: string[];
};
export function categoryAllowed(
  scope: CategoryScope | undefined,
  categoryId?: string | null,
) {
  if (!scope) return false;
  return (
    scope.aclCategories === undefined ||
    (categoryId
      ? scope.aclCategories.includes(categoryId)
      : scope.aclRoot === true)
  );
}
export function categoryDocumentWhere(
  scopes: CategoryScope[],
): Prisma.DocumentWhereInput {
  return {
    OR: scopes.map((scope) => ({
      spaceId: scope.id,
      ...(scope.aclCategories === undefined
        ? {}
        : {
            OR: [
              ...(scope.aclRoot ? [{ categoryId: null }] : []),
              { categoryId: { in: scope.aclCategories } },
            ],
          }),
    })),
  };
}

export function resolveCategories(
  categories: Array<{ id: string; parentId?: string | null }>,
  rules: Array<{ categoryId?: string | null; allowed: boolean }>,
  inherited: boolean,
) {
  const nodes = new Map(categories.map((category) => [category.id, category]));
  const overrides = new Map<string, boolean>();
  for (const rule of rules)
    if (rule.categoryId)
      overrides.set(
        rule.categoryId,
        overrides.get(rule.categoryId) || false || rule.allowed,
      );
  return categories
    .filter((category) => {
      const visited = new Set<string>();
      let current: string | null = category.id;
      while (current) {
        if (visited.has(current) || !nodes.has(current)) return false;
        visited.add(current);
        if (overrides.has(current)) return overrides.get(current)!;
        current = nodes.get(current)!.parentId || null;
      }
      return inherited;
    })
    .map((category) => category.id);
}
