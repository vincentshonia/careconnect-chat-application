/** Minimal, dependency-free CSV export used by the admin console. */

/**
 * Spreadsheets treat a cell beginning with =, +, - or @ as a formula, so an
 * exported value such as `=HYPERLINK(...)` would execute when the file is
 * opened. Prefixing a single quote neutralises it while keeping the text
 * readable.
 */
function neutralize(raw: string): string {
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = neutralize(typeof value === "object" ? JSON.stringify(value) : String(value));
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}


export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const keys = columns ?? Object.keys(rows[0]);
  const head = keys.map(escapeCell).join(",");
  const body = rows.map((row) => keys.map((k) => escapeCell(row[k])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Trigger a browser download of the given rows as a timestamped CSV file. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  const csv = toCsv(rows, columns);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download CSV text that was generated on the server. The browser only
 * receives the finished file, never the underlying rows.
 */
export function saveCsv(filename: string, csv: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
