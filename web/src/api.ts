/**
 * API types and client.
 *
 * Types are hand-mirrored from the Pydantic schemas rather than generated, so the
 * frontend fails at compile time if the contract drifts.
 */

export type DirectiveStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "CLOSED" | "UNKNOWN";

export type ActionItemStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "BLOCKED"
  | "RESOLVED"
  | "DISMISSED";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNSPECIFIED";
export type FlagSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Authority {
  id: number;
  code: string;
  name: string;
  jurisdiction: string;
  region: string;
}

export interface Flag {
  id: number;
  action_item_id: number | null;
  field: string;
  issue: string;
  severity: FlagSeverity;
  message: string;
  raw_value: string | null;
}

export interface StatusChange {
  id: number;
  from_status: ActionItemStatus;
  to_status: ActionItemStatus;
  changed_by: string;
  note: string | null;
  changed_at: string;
}

export interface ActionItem {
  id: number;
  directive_id: number;
  title: string;
  description: string | null;
  owner: string | null;
  status: ActionItemStatus;
  priority: Priority;
  due_date: string | null;
  updated_at: string;
}

export interface ActionItemDetail extends ActionItem {
  status_changes: StatusChange[];
}

export interface FlagSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  max_severity: FlagSeverity | null;
}

export interface Directive {
  id: number;
  reference_code: string | null;
  title: string;
  summary: string | null;
  status: DirectiveStatus;
  document_type: string | null;
  therapeutic_area: string | null;
  source_url: string | null;
  published_date: string | null;
  effective_date: string | null;
  authority: Authority;
  action_items: ActionItem[];
  flags: Flag[];
  flag_summary: FlagSummary;
  open_item_count: number;
}

export interface DirectiveDetail extends Directive {
  raw_payload: Record<string, unknown>;
  ingested_at: string;
}

export interface DirectiveList {
  items: Directive[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface CountBucket {
  key: string;
  label: string;
  count: number;
}

export interface MetaCounts {
  total_directives: number;
  total_action_items: number;
  open_action_items: number;
  flagged_directives: number;
  by_status: CountBucket[];
  by_severity: CountBucket[];
  by_authority: CountBucket[];
  by_issue: CountBucket[];
}

export interface Filters {
  q: string;
  authority: string[];
  status: DirectiveStatus[];
  severity: FlagSeverity[];
  flaggedOnly: boolean;
  hasOpenItems: boolean;
  sort: string;
  order: "asc" | "desc";
  page: number;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  authority: [],
  status: [],
  severity: [],
  flaggedOnly: false,
  hasOpenItems: false,
  sort: "risk",
  order: "desc",
  page: 1,
};

/** Carries the server's structured error body so the UI can show a real reason. */
export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    let detail: unknown = null;
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body?.detail ?? body;
      // FastAPI puts our structured 409 payload under `detail`.
      if (detail && typeof detail === "object" && "message" in detail) {
        message = String((detail as { message: unknown }).message);
      } else if (typeof detail === "string") {
        message = detail;
      }
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(response.status, message, detail);
  }

  return response.json() as Promise<T>;
}

export function buildQuery(filters: Filters, pageSize = 100): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  filters.authority.forEach((a) => params.append("authority", a));
  filters.status.forEach((s) => params.append("status", s));
  filters.severity.forEach((s) => params.append("severity", s));
  if (filters.flaggedOnly) params.set("flagged_only", "true");
  if (filters.hasOpenItems) params.set("has_open_items", "true");
  params.set("sort", filters.sort);
  params.set("order", filters.order);
  params.set("page", String(filters.page));
  params.set("page_size", String(pageSize));
  return params.toString();
}

export const api = {
  directives: (filters: Filters) =>
    request<DirectiveList>(`/api/directives?${buildQuery(filters)}`),
  directive: (id: number) => request<DirectiveDetail>(`/api/directives/${id}`),
  counts: () => request<MetaCounts>("/api/meta/counts"),
  updateActionItem: (id: number, status: ActionItemStatus, note?: string) =>
    request<ActionItemDetail>(`/api/action-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, note: note ?? null }),
    }),
};
