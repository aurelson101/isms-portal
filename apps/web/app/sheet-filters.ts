export type SheetRange = {
  firstColumn: number;
  lastColumn: number;
  headerRow: number;
  lastRow: number;
};

export function sheetColumn(letters: string): number {
  return (
    [...letters].reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    ) - 1
  );
}

export function sheetFilterRange(reference: string | null): SheetRange | null {
  const match = reference?.match(
    /^\$?([A-Z]{1,3})\$?([1-9]\d*)(?::\$?([A-Z]{1,3})\$?([1-9]\d*))?$/,
  );
  if (!match) return null;
  const firstColumn = sheetColumn(match[1]);
  const lastColumn = sheetColumn(match[3] || match[1]);
  const headerRow = Number(match[2]);
  const lastRow = Number(match[4] || match[2]);
  if (
    lastColumn < firstColumn ||
    lastColumn > 16383 ||
    lastRow < headerRow ||
    lastRow > 1048576
  )
    return null;
  return { firstColumn, lastColumn, headerRow, lastRow };
}

export function matchesSheetFilters(
  row: string[],
  filters: Record<number, string>,
): boolean {
  return Object.entries(filters).every(([column, value]) =>
    (row[Number(column)] || "")
      .toLowerCase()
      .includes(value.trim().toLowerCase()),
  );
}
