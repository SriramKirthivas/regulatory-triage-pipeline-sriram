/**
 * Saved views — named filter sets.
 *
 * Persisted to localStorage rather than the database: a saved view is a personal
 * working preference, not regulatory data, and keeping it client-side avoids
 * inventing a user table this system does not otherwise need. The trade-off is
 * that views do not follow an operator between machines, which is the right call
 * for a prototype and is called out in the UI.
 */

import type { UpdateFilters } from "../api";

const KEY = "artixio.savedViews.v1";

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  filters: UpdateFilters;
}

function read(): SavedView[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    // Corrupt storage should not take the app down — start clean.
    return [];
  }
}

function write(views: SavedView[]): void {
  localStorage.setItem(KEY, JSON.stringify(views));
  window.dispatchEvent(new Event("artixio:views-changed"));
}

export const savedViews = {
  list: read,

  add(name: string, filters: UpdateFilters): SavedView {
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      // Page number is a cursor, not a filter — a saved view always opens at the top.
      filters: { ...filters, page: 1 },
    };
    write([view, ...read()]);
    return view;
  },

  remove(id: string): void {
    write(read().filter((v) => v.id !== id));
  },

  rename(id: string, name: string): void {
    write(read().map((v) => (v.id === id ? { ...v, name: name.trim() } : v)));
  },
};

/** Human-readable description of what a view filters on. */
export function describeFilters(filters: UpdateFilters): string[] {
  const parts: string[] = [];
  if (filters.q) parts.push(`search "${filters.q}"`);
  if (filters.authority.length) parts.push(`authority: ${filters.authority.join(", ")}`);
  if (filters.status.length) parts.push(`status: ${filters.status.join(", ")}`);
  if (filters.severity.length) parts.push(`severity: ${filters.severity.join(", ")}`);
  if (filters.triage.length) parts.push(`triage: ${filters.triage.join(", ")}`);
  if (filters.owner.length) parts.push(`owner: ${filters.owner.join(", ")}`);
  if (filters.flaggedOnly) parts.push("flagged only");
  if (filters.overdueOnly) parts.push("overdue only");
  if (parts.length === 0) parts.push("no filters — all records");
  return parts;
}
