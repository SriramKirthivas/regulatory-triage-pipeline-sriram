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

export type TriageStatus = "NO_ITEMS" | "PENDING" | "IN_PROGRESS" | "RESOLVED";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNSPECIFIED";
export type FlagSeverity = "INFO" | "WARNING" | "CRITICAL";
export type FlagSource = "SYSTEM" | "MANUAL";

export const FLAG_ISSUES = [
  "MISSING_REQUIRED_DATE",
  "UNPARSEABLE_DATE",
  "ILLOGICAL_DATE_ORDER",
  "MALFORMED_TEXT",
  "UNKNOWN_ENUM_VALUE",
  "DUPLICATE_REFERENCE_CODE",
  "MISSING_REFERENCE_CODE",
  "CONFLICTING_STATUS",
  "TRUNCATED_CONTENT",
] as const;
export type FlagIssue = (typeof FLAG_ISSUES)[number];

export const ACTION_STATUSES: ActionItemStatus[] = [
  "PENDING",
  "IN_REVIEW",
  "BLOCKED",
  "RESOLVED",
  "DISMISSED",
];

export const PRIORITIES: Priority[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNSPECIFIED",
];

export interface Authority {
  id: number;
  code: string;
  name: string;
  jurisdiction: string;
  region: string;
  directive_count: number;
  action_item_count: number;
  open_action_items: number;
  flag_count: number;
  critical_flag_count: number;
  latest_published: string | null;
}

export interface DirectiveRef {
  id: number;
  reference_code: string | null;
  title: string;
  authority_code: string;
}

export interface Flag {
  id: number;
  directive_id: number;
  action_item_id: number | null;
  field: string;
  issue: FlagIssue;
  severity: FlagSeverity;
  message: string;
  raw_value: string | null;
  source: FlagSource;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
}

export interface FlagRow extends Flag {
  directive: DirectiveRef;
  action_item_title: string | null;
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

export interface ActionItemRow extends ActionItem {
  directive: DirectiveRef;
  overdue: boolean;
  flag_count: number;
}

export interface FlagSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  open: number;
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
  triage_status: TriageStatus;
  primary_owner: string | null;
  owner_count: number;
  next_due_date: string | null;
  overdue: boolean;
}

export interface DirectiveDetail extends Directive {
  raw_payload: Record<string, unknown>;
  ingested_at: string;
}

export interface Paged<T> {
  items: T[];
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

export interface TableStat {
  table: string;
  rows: number;
}

export interface Health {
  status: string;
  database: string;
  latency_ms: number | null;
  version: string;
  checked_at: string;
  tables: TableStat[];
  ingest: Record<string, number>;
}

export interface Neighbours {
  previous_id: number | null;
  next_id: number | null;
  position: number;
  total: number;
}

export interface RevalidateResult {
  directive_id: number;
  previous_flag_count: number;
  current_flag_count: number;
  added: number;
  cleared: number;
  manual_preserved: number;
  message: string;
}

/* ------------------------------------------------------------------ filters */

export interface UpdateFilters {
  q: string;
  authority: string[];
  status: DirectiveStatus[];
  severity: FlagSeverity[];
  triage: TriageStatus[];
  owner: string[];
  flaggedOnly: boolean;
  overdueOnly: boolean;
  sort: string;
  order: "asc" | "desc";
  page: number;
}

export const EMPTY_UPDATE_FILTERS: UpdateFilters = {
  q: "",
  authority: [],
  status: [],
  severity: [],
  triage: [],
  owner: [],
  flaggedOnly: false,
  overdueOnly: false,
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

/**
 * Where the API lives.
 *
 * Empty by default, so every request stays same-origin: in dev the Vite proxy
 * forwards it, and in production a Vercel rewrite forwards it. Same-origin means
 * no CORS preflight and no origin allowlist to keep in sync.
 *
 * Set VITE_API_URL at build time to call a different host directly instead — the
 * API's CORS_ORIGINS must then include the frontend's origin.
 */
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!response.ok) {
    let detail: unknown = null;
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body?.detail ?? body;
      if (detail && typeof detail === "object" && "message" in detail) {
        message = String((detail as { message: unknown }).message);
      } else if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        // FastAPI 422 validation errors arrive as a list.
        const first = detail[0] as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(first.loc) ? first.loc.slice(-1)[0] : "";
        message = field ? `${field}: ${first.msg}` : String(first.msg);
      }
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    throw new ApiError(response.status, message, detail);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function buildUpdateQuery(filters: UpdateFilters, pageSize = 100): string {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  filters.authority.forEach((a) => p.append("authority", a));
  filters.status.forEach((s) => p.append("status", s));
  filters.severity.forEach((s) => p.append("severity", s));
  filters.triage.forEach((t) => p.append("triage", t));
  filters.owner.forEach((o) => p.append("owner", o));
  if (filters.flaggedOnly) p.set("flagged_only", "true");
  if (filters.overdueOnly) p.set("overdue_only", "true");
  p.set("sort", filters.sort);
  p.set("order", filters.order);
  p.set("page", String(filters.page));
  p.set("page_size", String(pageSize));
  return p.toString();
}

export interface ActionItemQuery {
  q?: string;
  status?: ActionItemStatus[];
  priority?: Priority[];
  owner?: string[];
  authority?: string[];
  open_only?: boolean;
  overdue_only?: boolean;
  unassigned_only?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface FlagQuery {
  q?: string;
  severity?: FlagSeverity[];
  issue?: FlagIssue[];
  source?: FlagSource[];
  authority?: string[];
  state?: "open" | "resolved" | "all";
  page?: number;
  page_size?: number;
}

function toQuery(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => p.append(key, String(v)));
    } else {
      p.set(key, String(value));
    }
  }
  return p.toString();
}

export const api = {
  directives: (filters: UpdateFilters) =>
    request<Paged<Directive>>(`/api/directives?${buildUpdateQuery(filters)}`),
  directive: (id: number) => request<DirectiveDetail>(`/api/directives/${id}`),
  neighbours: (id: number) => request<Neighbours>(`/api/directives/${id}/neighbours`),
  counts: () => request<MetaCounts>("/api/meta/counts"),
  authorities: () => request<Authority[]>("/api/authorities"),
  owners: () => request<string[]>("/api/action-items/owners"),
  health: () => request<Health>("/health"),

  actionItems: (query: ActionItemQuery) =>
    request<Paged<ActionItemRow>>(`/api/action-items?${toQuery({ ...query })}`),
  actionItem: (id: number) => request<ActionItemDetail>(`/api/action-items/${id}`),

  flags: (query: FlagQuery) => request<Paged<FlagRow>>(`/api/flags?${toQuery({ ...query })}`),

  updateActionItem: (
    id: number,
    patch: {
      status?: ActionItemStatus;
      owner?: string | null;
      priority?: Priority;
      due_date?: string | null;
      note?: string | null;
    },
  ) =>
    request<ActionItemDetail>(`/api/action-items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  createActionItem: (
    directiveId: number,
    body: {
      title: string;
      description?: string | null;
      owner?: string | null;
      priority?: Priority;
      due_date?: string | null;
    },
  ) =>
    request<ActionItem>(`/api/directives/${directiveId}/action-items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createFlag: (
    directiveId: number,
    body: {
      issue: FlagIssue;
      severity: FlagSeverity;
      field?: string;
      message: string;
      action_item_id?: number | null;
    },
  ) =>
    request<Flag>(`/api/directives/${directiveId}/flags`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  revalidate: (directiveId: number) =>
    request<RevalidateResult>(`/api/directives/${directiveId}/revalidate`, {
      method: "POST",
    }),

  resolveFlag: (flagId: number, resolution_note?: string) =>
    request<Flag>(`/api/flags/${flagId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution_note: resolution_note ?? null }),
    }),

  reopenFlag: (flagId: number) =>
    request<Flag>(`/api/flags/${flagId}/reopen`, { method: "POST" }),
};
