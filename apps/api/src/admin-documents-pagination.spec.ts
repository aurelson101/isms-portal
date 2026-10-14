import { describe, expect, it, vi } from "vitest";
import { DocumentAdminController } from "./controllers";

function setup() {
  const items = [{ id: "document" }];
  const document = { findMany: vi.fn().mockResolvedValue(items), count: vi.fn().mockResolvedValue(41) };
  const controller = new DocumentAdminController({ document } as never, {} as never, {} as never, {} as never, {} as never);
  return { controller, document, items };
}

describe("Admin document pagination", () => {
  it("fetches only the requested page with a stable ordering", async () => {
    const h = setup();
    expect(await h.controller.list("", "2", "20")).toEqual({ items: h.items, page: 2, limit: 20, total: 41 });
    expect(h.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20, take: 20, where: { deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }));
  });
  it.each(["Infinity", "NaN", "-1", "1.5"])("normalizes invalid page %s and caps the page size", async (page) => {
    const h = setup();
    expect(await h.controller.list("", page, "999")).toMatchObject({ page: 1, limit: 200 });
    expect(h.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 200 }));
  });
  it("keeps the legacy array response for existing clients", async () => {
    const h = setup();
    expect(await h.controller.list()).toEqual(h.items);
  });
  it("loads only the fields needed by governance selectors without counting", async () => {
    const h = setup();
    expect(await h.controller.list("", undefined, "50", "updatedAt", "desc", "true")).toEqual(h.items);
    expect(h.document.count).not.toHaveBeenCalled();
    expect(h.document.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: {
        id: true,
        translations: { select: { locale: true, title: true } },
        versions: { select: { id: true, locale: true, version: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: 0, take: 50,
    });
  });
  it("paginates lightweight governance references", async () => {
    const h = setup();
    expect(await h.controller.list("", "2", "20", "updatedAt", "desc", "true")).toEqual({ items: h.items, page: 2, limit: 20, total: 41 });
    expect(h.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
  });
});
