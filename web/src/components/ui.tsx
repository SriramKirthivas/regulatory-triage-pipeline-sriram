/** Shared presentational primitives. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type {
  ActionItemStatus,
  DirectiveStatus,
  FlagSeverity,
  Priority,
  TriageStatus,
} from "../api";
import { initials, label } from "../lib/format";

/* ------------------------------------------------------------------- pills */

type Tone =
  | "neutral"
  | "brand"
  | "active"
  | "info"
  | "warning"
  | "critical"
  | "success";

export function Pill({
  tone = "neutral",
  led = false,
  children,
}: {
  tone?: Tone;
  led?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`pill ${tone}`}>
      {led && <span className="led" />}
      {children}
    </span>
  );
}

const DIRECTIVE_TONE: Record<DirectiveStatus, Tone> = {
  ACTIVE: "info",
  DRAFT: "neutral",
  SUPERSEDED: "neutral",
  CLOSED: "neutral",
  UNKNOWN: "warning",
};

export const DirectiveStatusPill = ({ status }: { status: DirectiveStatus }) => (
  <Pill tone={DIRECTIVE_TONE[status]}>{label(status)}</Pill>
);

const TRIAGE_TONE: Record<TriageStatus, Tone> = {
  PENDING: "warning",
  IN_PROGRESS: "active",
  RESOLVED: "success",
  NO_ITEMS: "neutral",
};

const TRIAGE_LABEL: Record<TriageStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  NO_ITEMS: "No items",
};

export const TriageStatusPill = ({ status }: { status: TriageStatus }) => (
  <Pill tone={TRIAGE_TONE[status]} led>
    {TRIAGE_LABEL[status]}
  </Pill>
);

const ITEM_TONE: Record<ActionItemStatus, Tone> = {
  PENDING: "warning",
  IN_REVIEW: "active",
  BLOCKED: "critical",
  RESOLVED: "success",
  DISMISSED: "neutral",
};

export const ActionStatusPill = ({ status }: { status: ActionItemStatus }) => (
  <Pill tone={ITEM_TONE[status]} led>
    {label(status)}
  </Pill>
);

const SEVERITY_TONE: Record<FlagSeverity, Tone> = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
};

export const SeverityPill = ({ severity }: { severity: FlagSeverity }) => (
  <Pill tone={SEVERITY_TONE[severity]} led>
    {label(severity)}
  </Pill>
);

export function PriorityText({ priority }: { priority: Priority }) {
  return <span className={`prio-${priority}`}>{label(priority)}</span>;
}

/** Severity as a compact row-level indicator with no flags at all handled. */
export function ValidationCell({
  critical,
  warning,
  info,
  open,
}: {
  critical: number;
  warning: number;
  info: number;
  open: number;
}) {
  if (critical + warning + info === 0) {
    return <span className="pill success">Clean</span>;
  }
  if (open === 0) {
    return <span className="pill neutral">Reviewed</span>;
  }
  return (
    <span className="flagcount" title={`${open} unresolved of ${critical + warning + info}`}>
      {critical > 0 && <span className="fc-c">{critical}C</span>}
      {warning > 0 && <span className="fc-w">{warning}W</span>}
      {info > 0 && <span className="fc-i">{info}I</span>}
    </span>
  );
}

export function Owner({ name }: { name: string | null }) {
  if (!name) return <span className="faint small">Unassigned</span>;
  return (
    <span className="owner">
      <span className="avatar">{initials(name)}</span>
      <span>{name}</span>
    </span>
  );
}

/* -------------------------------------------------------------------- tabs */

export interface TabSpec {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabSpec[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={tab.key === active}
          className={tab.key === active ? "tab active" : "tab"}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="n">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- icons */

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);

export const Icons = {
  search: () => icon(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>),
  filter: () => icon(<path d="M3 5h18l-7 8v6l-4 2v-8Z" />),
  bookmark: () => icon(<path d="M6 3h12v18l-6-4-6 4Z" />),
  download: () => icon(<><path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>),
  plus: () => icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>),
  flag: () => icon(<><path d="M5 21V4h13l-2 4 2 4H5" /></>),
  check: () => icon(<path d="m4 12 5 5L20 6" />),
  shield: () => icon(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" /><path d="m9 12 2 2 4-4" /></>),
  inbox: () => icon(<><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4 5h16l1 7v7H3v-7Z" /></>),
  building: () => icon(<><path d="M4 21V4h10v17" /><path d="M14 9h6v12" /><path d="M7 8h3M7 12h3M7 16h3" /></>),
  doc: () => icon(<><path d="M6 2h8l4 4v16H6Z" /><path d="M14 2v4h4" /><path d="M9 13h6M9 17h6" /></>),
  task: () => icon(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-5" /></>),
  alert: () => icon(<><path d="M12 4 2 20h20Z" /><path d="M12 10v4" /><path d="M12 17h.01" /></>),
  layers: () => icon(<><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>),
  pulse: () => icon(<path d="M2 12h4l3 8 4-16 3 8h6" />),
  gear: () => icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
  back: () => icon(<><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>),
  prev: () => icon(<path d="m15 6-6 6 6 6" />),
  next: () => icon(<path d="m9 6 6 6-6 6" />),
  refresh: () => icon(<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>),
  x: () => icon(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  grid: () => icon(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>),
  rows: () => icon(<><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>),
};

/* ------------------------------------------------------------------- modal */

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function Field({
  label: text,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{text}</label>
      {children}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ toasts */

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "ok" | "err";
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((tone: "ok" | "err", title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, title, body, tone }]);
    // Errors linger: they usually carry a reason the operator needs to read.
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, tone === "ok" ? 3200 : 7000);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (title, body) => push("ok", title, body),
      error: (title, body) => push("err", title, body),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toastwrap">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role="status">
            <div>
              <strong>{toast.title}</strong>
              {toast.body && <span className="muted">{toast.body}</span>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <table>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((__, c) => (
              <td key={c}>
                <div className="skeleton" style={{ width: `${45 + ((r + c) % 5) * 11}%` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Stat({
  label: text,
  value,
  foot,
  tone,
}: {
  label: string;
  value: ReactNode;
  foot?: string;
  tone?: "critical" | "brand";
}) {
  return (
    <div className="stat">
      <div className="label">{text}</div>
      <div className={tone ? `value ${tone}` : "value"}>{value}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}
