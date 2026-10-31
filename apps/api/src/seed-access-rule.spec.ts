import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

const { rootAccessRuleWhere } = createRequire(import.meta.url)(
  "../prisma/seed.js",
) as {
  rootAccessRuleWhere: (
    client: unknown,
    groupId: string,
    spaceId: string,
  ) => Promise<{ id: string }>;
};

it("reuses the root ACL without selecting a category override", async () => {
  const findFirst = vi.fn().mockResolvedValue({ id: "existing-root-rule" });
  expect(
    await rootAccessRuleWhere({ accessRule: { findFirst } }, "group", "space"),
  ).toEqual({ id: "existing-root-rule" });
  expect(findFirst).toHaveBeenCalledWith({
    where: { groupId: "group", spaceId: "space", categoryId: null },
    select: { id: true },
  });
});

it("uses a supported UUID unique selector when no root rule exists", async () => {
  const findFirst = vi.fn().mockResolvedValue(null);
  const selector = await rootAccessRuleWhere(
    { accessRule: { findFirst } },
    "group",
    "space",
  );
  expect(selector).toEqual({
    id: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
  });
});
