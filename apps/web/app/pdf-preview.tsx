"use client";

import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from "pdfjs-dist";
import { portalCatalog } from "./i18n/catalogs";
import type { Locale } from "./i18n/locale";
import type { PdfZoom } from "./pdf-progress";

export function PdfPreview({
  url,
  title,
  page,
  zoom,
  locale,
  onPageCount,
}: {
  url: string;
  title: string;
  page: number;
  zoom: PdfZoom;
  locale: Locale;
  onPageCount: (count: number) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");
  const copy = portalCatalog[locale];

  useEffect(() => {
    if (!frame.current) return;
    frame.current.scrollTop = 0;
    frame.current.scrollLeft = 0;
  }, [url, page]);

  useEffect(() => {
    let stopped = false;
    let task: PDFDocumentLoadingTask | undefined;
    setPdf(null);
    setState("loading");
    setText("");
    void import("pdfjs-dist")
      .then(async (library) => {
        if (stopped) return;
        library.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        task = library.getDocument({
          url,
          withCredentials: true,
          enableXfa: false,
          useWasm: false,
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        });
        const document = await task.promise;
        if (!stopped) {
          setPdf(document);
          onPageCount(document.numPages);
        }
      })
      .catch(() => {
        if (!stopped) setState("error");
      });
    return () => {
      stopped = true;
      void task?.destroy().catch(() => undefined);
    };
  }, [url, onPageCount]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !canvas.current || !size.width) return;
    let stopped = false;
    let render: RenderTask | undefined;
    const surface = canvas.current;
    setState("loading");
    setText("");
    void pdf
      .getPage(Math.min(Math.max(1, page), pdf.numPages))
      .then(async (sheet) => {
        if (stopped) return;
        const original = sheet.getViewport({ scale: 1 });
        const widthScale = Math.max(0.05, (size.width - 16) / original.width);
        const scale =
          typeof zoom === "number"
            ? zoom / 100
            : zoom === "page-fit"
              ? Math.min(
                  widthScale,
                  Math.max(0.05, (size.height - 16) / original.height),
                )
              : widthScale;
        const viewport = sheet.getViewport({ scale });
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(8_000_000 / (viewport.width * viewport.height)),
        );
        surface.width = Math.max(1, Math.floor(viewport.width * ratio));
        surface.height = Math.max(1, Math.floor(viewport.height * ratio));
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        render = sheet.render({
          canvas: surface,
          viewport,
          transform: [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        if (stopped) return;
        setState("ready");
        const content = await sheet.getTextContent().catch(() => null);
        if (!stopped && content)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      })
      .catch(() => {
        if (!stopped) setState("error");
      });
    return () => {
      stopped = true;
      render?.cancel();
    };
  }, [pdf, page, zoom, size]);

  return (
    <div ref={frame} className="pdf-readonly" aria-busy={state === "loading"}>
      {state !== "ready" && (
        <p role="status">
          {state === "error" ? copy.previewError : copy.previewLoading}
        </p>
      )}
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${title} (${page})`}
        style={{ visibility: state === "ready" ? "visible" : "hidden" }}
      />
      <p className="pdf-accessible-text">{text}</p>
    </div>
  );
}
