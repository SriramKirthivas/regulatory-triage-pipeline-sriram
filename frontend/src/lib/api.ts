import type { ActionItem, AnomalySummary, Authority, DirectiveLite, DirectiveOut, Filters, Page, WritableStatus } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
  get userMessage(): string {
    const b = this.body as any;
    if (b?.issues?.length) return b.issues.map((i: any) => `${i.field}: ${i.message}`).join("; ");
    if (b?.detail?.error === "invalid_transition")
      return `Cannot move ${b.detail.from} to ${b.detail.to}. Allowed: ${b.detail.allowed.join(", ")}.`;
    if (typeof b?.detail === "string") return b.detail;
    return `Request failed (${this.status})`;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json();
}

export function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  f.status.forEach((s) => p.append("status", s));
  if (f.authority_id != null) p.set("authority_id", String(f.authority_id));
  if (f.severity) p.set("severity", f.severity);
  if (f.flagged != null) p.set("flagged", String(f.flagged));
  if (f.errors_only) p.set("errors_only", "true");
  p.set("limit", "500");
  return p.toString();
}

export const api = {
  items: (f: Filters) => request<Page>(`/api/action-items?${buildQuery(f)}`),
  directives: (p: { authority_id?: number | null; flagged?: boolean | null } = {}) => {
    const q = new URLSearchParams();
    if (p.authority_id != null) q.set("authority_id", String(p.authority_id));
    if (p.flagged != null) q.set("flagged", String(p.flagged));
    return request<DirectiveLite[]>(`/api/directives?${q}`);
  },
  directive: (id: number) => request<DirectiveOut>(`/api/directives/${id}`),
  authorities: () => request<Authority[]>("/api/authorities"),
  anomalies: () => request<AnomalySummary>("/api/anomalies"),
  setStatus: (id: number, status: WritableStatus) =>
    request<ActionItem>(`/api/action-items/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
};
