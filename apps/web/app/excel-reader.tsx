"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { Icon } from "./icons";
import { portalCatalog } from "./i18n/catalogs";
import type { Locale } from "./i18n/locale";
import { readExcelBook, type ExcelBook, type ExcelRow } from "./excel-reader-model";
import { matchesSavedExcelFilter } from "./excel-saved-filters";

const labels = {
  fr: { saved: "Restaurer les filtres du fichier", original: "Filtre enregistré", image: "Image intégrée", fit: "Ajuster", sheets: "Feuilles", filter: "Filtrer", all: "Tout", blank: "(Vides)", search: "Rechercher dans la feuille", reset: "Effacer les filtres", hidden: "Afficher les lignes masquées", previous: "Précédent", next: "Suivant", rows: "lignes", zoom: "Zoom", empty: "Aucun résultat" },
  en: { saved: "Restore file filters", original: "Saved filter", image: "Embedded image", fit: "Fit width", sheets: "Worksheets", filter: "Filter", all: "All", blank: "(Blanks)", search: "Search worksheet", reset: "Clear filters", hidden: "Show hidden rows", previous: "Previous", next: "Next", rows: "rows", zoom: "Zoom", empty: "No results" },
  es: { saved: "Restaurar filtros del archivo", original: "Filtro guardado", image: "Imagen integrada", fit: "Ajustar", sheets: "Hojas", filter: "Filtrar", all: "Todo", blank: "(Vacías)", search: "Buscar en la hoja", reset: "Borrar filtros", hidden: "Mostrar filas ocultas", previous: "Anterior", next: "Siguiente", rows: "filas", zoom: "Zoom", empty: "Sin resultados" },
  sk: { saved: "Obnoviť filtre súboru", original: "Uložený filter", image: "Vložený obrázok", fit: "Prispôsobiť", sheets: "Hárky", filter: "Filtrovať", all: "Všetko", blank: "(Prázdne)", search: "Hľadať v hárku", reset: "Vymazať filtre", hidden: "Zobraziť skryté riadky", previous: "Predchádzajúce", next: "Ďalšie", rows: "riadkov", zoom: "Priblíženie", empty: "Žiadne výsledky" },
};

export function ExcelReader({ url, locale }: { url: string; locale: Locale }) {
  const t = labels[locale];
  const copy = portalCatalog[locale];
  const [book, setBook] = useState<ExcelBook | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sheetId, setSheetId] = useState(0);
  const [filters, setFilters] = useState<Record<number, string | null>>({});
  const [useSaved, setUseSaved] = useState(true);
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [imagePositions, setImagePositions] = useState<Array<{ id: string; src: string; left: number; top: number; width: number; height: number }>>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setState("loading"); setBook(null); setFilters({}); setUseSaved(true); setQuery(""); setPage(0); setShowHidden(false);
    void fetch(url, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error("preview");
      const value = await readExcelBook(await response.arrayBuffer(), locale);
      if (abort.signal.aborted) return;
      setBook(value); setSheetId(value.activeId); setState("ready");
    }).catch(() => { if (!abort.signal.aborted) setState("error"); });
    return () => abort.abort();
  }, [url, locale]);
  const sheet = book?.sheets.find((entry) => entry.id === sheetId);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    resize.observe(element);
    return () => resize.disconnect();
  }, [sheet]);
  const header = sheet?.filter ? sheet.rows.find((row) => row.number === sheet.filter!.headerRow) : undefined;
  const dataRows = sheet?.rows.filter((row) => !sheet.filter || row.number > sheet.filter.headerRow && row.number <= sheet.filter.lastRow) || [];
  const options = Object.fromEntries((sheet?.columns || []).map((column) => [column.index,
    [...new Set(dataRows.map((row) => row.cells[column.index]?.text || ""))].sort((a, b) => a.localeCompare(b, locale, { numeric: true })),
  ]));
  const filtered = dataRows.filter((row) => {
    const saved = sheet?.savedFilters || [];
    const changed = !useSaved || Object.keys(filters).length > 0;
    const needsMask = useSaved && saved.some((filter) => filter.unsupported && !Object.hasOwn(filters, filter.column));
    return (showHidden || !row.hidden || saved.length > 0 && changed && !needsMask)
    && (!useSaved || saved.every((filter) => Object.hasOwn(filters, filter.column) || matchesSavedExcelFilter(row.cells[filter.column], filter)))
    && Object.entries(filters).every(([column, text]) => text === null || (row.cells[Number(column)]?.text || "").toLowerCase() === text.toLowerCase())
    && (!query.trim() || sheet?.columns.some((column) => row.cells[column.index]?.text.toLowerCase().includes(query.trim().toLowerCase())));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 100));
  const current = Math.min(page, pages - 1);
  const displayed = filtered.slice(current * 100, (current + 1) * 100);
  const displayedRowKey = displayed.map((row) => row.number).join(",");
  const visibleRows = header ? [header, ...displayed] : displayed;
  const tableWidth = sheet?.columns.reduce((sum, column) => sum + column.width, 46) || 46;
  const scale = zoom ? zoom / 100 : viewportWidth >= 700 ? Math.min(1, viewportWidth / tableWidth) : 1;
  useEffect(() => {
    const element = canvas.current;
    if (!element || !sheet) return;
    const measure = () => {
      const origin = element.getBoundingClientRect();
      const x = (column: number) => 46 + sheet.columns.reduce((sum, entry) => sum + (entry.index < Math.floor(column) ? entry.width : entry.index === Math.floor(column) ? entry.width * (column % 1) : 0), 0);
      const y = (row: number) => {
        const target = element.querySelector<HTMLTableRowElement>(`tr[data-excel-row="${Math.floor(row) + 1}"]`);
        if (!target) return undefined;
        const rect = target.getBoundingClientRect();
        return (rect.top - origin.top + rect.height * (row % 1)) / scale;
      };
      const next = sheet.images.flatMap((image) => {
        const top = y(image.top); if (top === undefined) return [];
        const left = x(image.left);
        const width = image.width ?? (image.right === undefined ? 0 : x(image.right) - left);
        const bottom = image.bottom === undefined ? undefined : y(image.bottom);
        const height = image.height ?? (bottom === undefined ? 0 : bottom - top);
        return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? [{ id: image.id, src: image.src, left, top, width: Math.min(2000, width), height: Math.min(2000, height) }] : [];
      });
      setImagePositions((previous) => previous.length === next.length && previous.every((item, index) => item.src === next[index].src && item.left === next[index].left && item.top === next[index].top && item.width === next[index].width && item.height === next[index].height) ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [sheet, displayedRowKey, scale]);

  if (state === "loading") return <p className="loading-state">{copy.previewLoading}</p>;
  if (state === "error" || !sheet || !book) return <p className="error-state">{copy.previewError}</p>;
  const cells = (row: ExcelRow, isHeader = false) => {
    const overflow = new Set<number>();
    return sheet.columns.map((column, columnIndex) => {
    if (overflow.has(column.index)) return null;
    const merge = sheet.merges.find((range) => row.number >= range.headerRow && row.number <= range.lastRow && column.index >= range.firstColumn && column.index <= range.lastColumn);
    const mergedColumns = merge ? sheet.columns.filter((col) => col.index >= merge.firstColumn && col.index <= merge.lastColumn) : [column];
    const mergedRows = merge ? visibleRows.filter((item) => item.number >= merge.headerRow && item.number <= merge.lastRow) : [row];
    if (merge && (mergedColumns[0]?.index !== column.index || mergedRows[0]?.number !== row.number)) return null;
    const cell = row.cells[column.index];
    const Tag = isHeader ? "th" : "td";
    const filterable = isHeader && sheet.filter && column.index >= sheet.filter.firstColumn && column.index <= sheet.filter.lastColumn;
    let colSpan = mergedColumns.length;
    if (!sheet.filter && !merge && cell?.text && cell.style.whiteSpace === "pre" && !["right", "center"].includes(String(cell.style.textAlign))) {
      for (const following of sheet.columns.slice(columnIndex + 1)) {
        const value = row.cells[following.index];
        if (value?.text || value?.style.backgroundColor || value?.style.borderLeft || sheet.merges.some((range) => row.number >= range.headerRow && row.number <= range.lastRow && following.index >= range.firstColumn && following.index <= range.lastColumn)) break;
        overflow.add(following.index); colSpan++;
      }
    }
    const saved = sheet.savedFilters.find((filter) => filter.column === column.index);
    return <Tag key={column.index} colSpan={colSpan} rowSpan={mergedRows.length} style={cell?.style} scope={isHeader ? "col" : undefined}>
      <span title={cell?.text}>{cell?.text || ""}</span>
      {filterable && <select aria-label={`${t.filter}: ${cell?.text || column.letter}`} value={Object.hasOwn(filters, column.index) ? filters[column.index] === null ? "" : String(options[column.index].indexOf(filters[column.index]!)) : useSaved && saved ? "saved" : ""} onChange={(event) => {
        const value = event.target.value;
        setFilters((previous) => { const next = { ...previous }; if (value === "saved") delete next[column.index]; else next[column.index] = value === "" ? null : options[column.index][Number(value)]; return next; });
        if (value === "saved") setUseSaved(true); setPage(0);
      }}>
        <option value="">{t.all}</option>
        {saved && <option value="saved">{t.original}{saved.values?.length ? ": " + saved.values.join(", ") : ""}</option>}
        {options[column.index].map((value, index) => <option key={index} value={index}>{value || t.blank}</option>)}
      </select>}
    </Tag>;
  });
  };
  return <section className="excel-reader" aria-label={copy.readonly}>
    <div className="excel-toolbar">
      <span className="readonly-label">{copy.readonly}</span>
      <div className="excel-search"><Icon name="search" /><input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></div>
      <button type="button" className="secondary" aria-label={t.reset} title={t.reset} disabled={!query && !Object.keys(filters).length && !(useSaved && sheet.savedFilters.length)} onClick={() => { setFilters({}); setUseSaved(false); setQuery(""); setPage(0); }}><Icon name="restore" /></button>
      {sheet.savedFilters.length > 0 && <button type="button" className="secondary" title={t.saved} aria-label={t.saved} disabled={useSaved && !Object.keys(filters).length && !query} onClick={() => { setFilters({}); setUseSaved(true); setShowHidden(false); setQuery(""); setPage(0); }}><Icon name="sync" /></button>}
      <select aria-label={t.zoom} value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value={0}>{t.fit}</option>{[75, 100, 125, 150].map((value) => <option value={value} key={value}>{value}%</option>)}</select>
      {dataRows.some((row) => row.hidden) && <label><input type="checkbox" checked={showHidden} onChange={(event) => { setShowHidden(event.target.checked); setPage(0); }} />{t.hidden}</label>}
    </div>
    <div className="excel-scroll" ref={scroll} tabIndex={0} role="region" aria-label={sheet.name} key={sheet.id}>
      <div className="excel-canvas" ref={canvas} style={{ zoom: scale, width: tableWidth } as CSSProperties}>
      <table className="excel-grid" style={{ width: tableWidth }}>
        <colgroup><col style={{ width: 46 }} />{sheet.columns.map((column) => <col key={column.index} style={{ width: column.width }} />)}</colgroup>
        <thead><tr className="excel-column-letters"><th aria-label={t.rows} />{sheet.columns.map((column) => <th key={column.index} scope="col">{column.letter}</th>)}</tr>
          {header && <tr className="excel-filter-heading" data-excel-row={header.number}><th className="excel-row-number" scope="row">{header.number}</th>{cells(header, true)}</tr>}
        </thead>
        <tbody>{displayed.map((row) => <tr key={row.number} data-excel-row={row.number} style={{ height: row.height }}><th className="excel-row-number" scope="row">{row.number}</th>{cells(row)}</tr>)}</tbody>
      </table>
      <div className="excel-images">{imagePositions.filter((image) => sheet.images.some((entry) => entry.src === image.src)).map((image, index) => <img key={image.id} src={image.src} alt={`${t.image} ${index + 1}`} draggable={false} style={{ left: image.left, top: image.top, width: image.width, height: image.height }} />)}</div>
      </div>
      {!filtered.length && <p role="status">{t.empty}</p>}
    </div>
    <div className="excel-footer">
      <div className="excel-sheet-tabs" role="tablist" aria-label={t.sheets}>{book.sheets.map((entry) => <button type="button" key={entry.id} role="tab" aria-selected={entry.id === sheet.id} onClick={() => { setSheetId(entry.id); setFilters({}); setUseSaved(true); setQuery(""); setPage(0); setShowHidden(false); }}>{entry.name}</button>)}</div>
      <div className="excel-pagination"><span aria-live="polite">{filtered.length} {t.rows} · {current + 1} / {pages}</span><button type="button" className="secondary" title={t.previous} aria-label={t.previous} disabled={current === 0} onClick={() => setPage(current - 1)}><Icon name="chevron" transform="rotate(180)" /></button><button type="button" className="secondary" title={t.next} aria-label={t.next} disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><Icon name="chevron" /></button></div>
    </div>
    {sheet.truncated && <small>{copy.truncated}</small>}
  </section>;
}
