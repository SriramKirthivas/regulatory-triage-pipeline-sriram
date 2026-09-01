/**
 * CSV export.
 *
 * Exports what the operator is currently looking at — the filtered, sorted rows —
 * because an export that silently returns something other than the visible result
 * set is worse than no export at all.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Leading =, +, - or @ are interpreted as formulas by Excel; prefix to neutralise.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function exportCsv<T>(
  filename: string,
  rows: T[],
  columns: { header: string; value: (row: T) => unknown }[],
): void {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => escapeCell(c.value(row))).join(","),
  );
  const csv = [header, ...body].join("\r\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${filename}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
