/** Presentation helpers. ISO dates are kept ISO — dense and unambiguous. */

export const label = (value: string): string =>
  value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");

export function initials(name: string | null): string {
  if (!name) return "–";
  const parts = name.replace(/[.]/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "–";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function relativeDays(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function isUntitled(title: string): boolean {
  return title.startsWith("[untitled");
}
