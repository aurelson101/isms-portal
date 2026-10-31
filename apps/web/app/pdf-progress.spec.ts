import { describe, expect, it } from "vitest";
import { normalizePdfPage, parsePdfProgress } from "./pdf-progress";

describe("PDF reading progress", () => {
  it.each([NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, 2.5, 0])(
    "rejects invalid live page input %s",
    (page) => {
      expect(normalizePdfPage(page)).toBe(1);
    },
  );
  it("accepts a valid live page number", () => {
    expect(normalizePdfPage(42)).toBe(42);
  });
  it.each([null, "{", "null", "false", "42", "[]"])(
    "handles malformed storage: %s",
    (value) => {
      expect(parsePdfProgress(value)).toEqual({ page: 1, zoom: "page-width" });
    },
  );
  it.each(["page-fit", "page-width", 50, 125, 200])(
    "restores supported zoom %s",
    (zoom) => {
      expect(parsePdfProgress(JSON.stringify({ page: 12, zoom }))).toEqual({
        page: 12,
        zoom,
      });
    },
  );
  it.each([-1, 0, 1.5, "3", 1e30])("rejects invalid page %s", (page) => {
    expect(parsePdfProgress(JSON.stringify({ page, zoom: 100 }))).toEqual({
      page: 1,
      zoom: 100,
    });
  });
  it.each([0, -100, 201, "100", "unexpected", null])(
    "rejects invalid zoom %s",
    (zoom) => {
      expect(parsePdfProgress(JSON.stringify({ page: 3, zoom }))).toEqual({
        page: 3,
        zoom: "page-width",
      });
    },
  );
});
