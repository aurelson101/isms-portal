export type PdfZoom = number | "page-width" | "page-fit";

export function normalizePdfPage(page: unknown): number {
  return typeof page === "number" && Number.isSafeInteger(page) && page >= 1
    ? page
    : 1;
}

export function parsePdfProgress(value: string | null): {
  page: number;
  zoom: PdfZoom;
} {
  const fallback = { page: 1, zoom: "page-width" as const };
  try {
    const saved: unknown = JSON.parse(value || "{}");
    if (!saved || typeof saved !== "object") return fallback;
    const { page, zoom } = saved as { page?: unknown; zoom?: unknown };
    return {
      page: normalizePdfPage(page),
      zoom:
        zoom === "page-width" || zoom === "page-fit"
          ? zoom
          : typeof zoom === "number" &&
              Number.isFinite(zoom) &&
              zoom >= 50 &&
              zoom <= 200
            ? zoom
            : "page-width",
    };
  } catch {
    return fallback;
  }
}
