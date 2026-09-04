export type ItemStatus = "pending" | "in_progress" | "blocked" | "resolved" | "unknown";
export type WritableStatus = Exclude<ItemStatus, "unknown">;
export type Severity = "critical" | "major" | "minor" | "info" | "unknown";

export interface Flag {
  code: string;
  field: string;
  message: string;
  level: "warn" | "error";
  raw: string | null;
}

export interface Authority {
  id: number;
  name: string;
  acronym: string;
  jurisdiction: string;
  region: string;
}

export interface DirectiveLite {
  id: number;
  reference_code: string;
  title: string | null;
  category: string;
  severity: Severity;
  status: string;
  published_at: string | null;
  effective_date: string | null;
  comment_deadline: string | null;
  authority: Authority;
  flags: Flag[];
  has_errors: boolean;
  duplicate_of: number | null;
}

export interface ActionItem {
  id: number;
  directive_id: number;
  title: string | null;
  owner: string | null;
  status: ItemStatus;
  status_raw: string;
  priority: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  flags: Flag[];
  has_errors: boolean;
  directive: DirectiveLite;
}

export interface ActionItemLite {
  id: number;
  title: string | null;
  owner: string | null;
  status: ItemStatus;
  priority: number;
  due_date: string | null;
  flags: Flag[];
  has_errors: boolean;
}

export interface DirectiveOut extends DirectiveLite {
  summary: string | null;
  action_items: ActionItemLite[];
}

export interface Page {
  items: ActionItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnomalySummary {
  total_items: number;
  total_directives: number;
  items_with_errors: number;
  items_with_warnings: number;
  directives_with_errors: number;
  by_code: Record<string, number>;
  by_status: Record<string, number>;
}

export interface Filters {
  q: string;
  status: ItemStatus[];
  authority_id: number | null;
  severity: Severity | null;
  flagged: boolean | null;
  errors_only: boolean;
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  blocked: "Blocked",
  resolved: "Resolved",
  unknown: "Quarantined",
};

export const WRITABLE: WritableStatus[] = ["pending", "in_progress", "blocked", "resolved"];
