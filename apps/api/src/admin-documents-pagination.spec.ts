import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { DocumentAdminController } from "./controllers";

function setup() {
  const items = [{ id: "document" }];
  const document = {
    findMany: vi.fn().mockResolvedValue(items),
    count: vi.fn().mockResolvedValue(41),
  };
  const controller = new DocumentAdminController(
    { document } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, document, items };
}

describe("Admin document pagination", () => {
  it("fetches only the requested page with a stable ordering", async () => {
    const h = setup();
    expect(await h.controller.list("", "2", "20")).toEqual({
      items: h.items,
      page: 2,
      limit: 20,
      total: 41,
    });
    expect(h.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: { deletedAt: null },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
    );
  });
  it.each(["Infinity", "NaN", "-1", "1.5"])(
    "normalizes invalid page %s and caps the page size",
    async (page) => {
      const h = setup();
      expect(await h.controller.list("", page, "999")).toMatchObject({
        page: 1,
        limit: 200,
      });
      expect(h.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 200 }),
      );
    },
  );
  it("keeps the legacy array response for existing clients", async () => {
    const h = setup();
    expect(await h.controller.list()).toEqual(h.items);
    expect(h.document.count).not.toHaveBeenCalled();
  });
  it.each(["updatedAt", "status", "publishedAt"])(
    "preserves ascending sorting for %s",
    async (sort) => {
      const h = setup();
      await h.controller.list("", "1", "20", sort, "asc");
      expect(h.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ [sort]: "asc" }, { id: "asc" }],
        }),
      );
    },
  );
  it.each([
    { order: "invalid" },
    { order: "ASC" },
    { order: "" },
    { order: ["asc", "desc"] },
  ])(
    "rejects invalid direction $order before querying the database",
    async ({ order }) => {
      const h = setup();
      await expect(
        h.controller.list("", "1", "20", "updatedAt", order as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.document.findMany).not.toHaveBeenCalled();
      expect(h.document.count).not.toHaveBeenCalled();
    },
  );
  it.each([
    { q: null },
    { q: ["first", "second"] },
    { q: { title: "document" } },
  ])(
    "rejects non-string searches before querying the database",
    async ({ q }) => {
      const h = setup();
      await expect(
        h.controller.list(q as never, "1", "20"),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(h.document.findMany).not.toHaveBeenCalled();
      expect(h.document.count).not.toHaveBeenCalled();
    },
  );
  it("loads only the fields needed by governance selectors without counting", async () => {
    const h = setup();
    expect(
      await h.controller.list("", undefined, "50", "updatedAt", "desc", "true"),
    ).toEqual(h.items);
    expect(h.document.count).not.toHaveBeenCalled();
    expect(h.document.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: {
        id: true,
        translations: { select: { locale: true, title: true } },
        versions: {
          select: { id: true, locale: true, version: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: 0,
      take: 50,
    });
  });
  it("paginates lightweight governance references", async () => {
    const h = setup();
    expect(
      await h.controller.list("", "2", "20", "updatedAt", "desc", "true"),
    ).toEqual({ items: h.items, page: 2, limit: 20, total: 41 });
    expect(h.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });
});
