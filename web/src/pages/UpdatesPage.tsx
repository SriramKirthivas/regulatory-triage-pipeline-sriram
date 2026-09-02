import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  EMPTY_UPDATE_FILTERS,
  type Directive,
  type DirectiveStatus,
  type FlagSeverity,
  type TriageStatus,
  type UpdateFilters,
} from "../api";
import { PageHeader } from "../components/PageHeader";
import {
  EmptyState,
  Icons,
  Modal,
  Field,
  Owner,
  TableSkeleton,
  TriageStatusPill,
  ValidationCell,
  useToast,
} from "../components/ui";
import { exportCsv } from "../lib/exportCsv";
import { isUntitled, relativeDays } from "../lib/format";
import { savedViews } from "../lib/savedViews";

/**
 * The Regulatory Updates queue — the primary triage surface.
 *
 * Filters live in React state and drive the server query, so sorting by risk (a
 * flag aggregate the client does not hold) is computed where the data is.
 */

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const SEVERITIES: FlagSeverity[] = ["CRITICAL", "WARNING", "INFO"];
const TRIAGES: TriageStatus[] = ["PENDING", "IN_PROGRESS", "RESOLVED"];
const DIRECTIVE_STATUSES: DirectiveStatus[] = [
  "ACTIVE",
  "DRAFT",
  "SUPERSEDED",
  "CLOSED",
  "UNKNOWN",
];

export function UpdatesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  // A saved view navigates here with filters in location state.
  const incoming = (location.state as { filters?: UpdateFilters } | null)?.filters;
  const [filters, setFilters] = useState<UpdateFilters>(incoming ?? EMPTY_UPDATE_FILTERS);
  const [searchInput, setSearchInput] = useState(incoming?.q ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (incoming) {
      setFilters(incoming);
      setSearchInput(incoming.q);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [incoming, navigate, location.pathname]);

  const debouncedSearch = useDebounced(searchInput);
  const effective = useMemo<UpdateFilters>(
    () => ({ ...filters, q: debouncedSearch }),
    [filters, debouncedSearch],
  );

  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });
  const { data: owners } = useQuery({ queryKey: ["owners"], queryFn: api.owners });
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["directives", effective],
    queryFn: () => api.directives(effective),
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];

  const patch = useCallback((update: Partial<UpdateFilters>) => {
    setFilters((current) => ({ ...current, ...update, page: update.page ?? 1 }));
  }, []);

  const toggle = useCallback(
    <K extends "authority" | "status" | "severity" | "triage" | "owner">(
      key: K,
      value: UpdateFilters[K][number],
    ) => {
      setFilters((current) => {
        const list = current[key] as string[];
        const next = list.includes(value as string)
          ? list.filter((v) => v !== value)
          : [...list, value as string];
        return { ...current, [key]: next, page: 1 } as UpdateFilters;
      });
    },
    [],
  );

  const activeChips = useMemo(() => {
    const chips: { label: string; clear: () => void }[] = [];
    filters.authority.forEach((a) =>
      chips.push({ label: `Authority: ${a}`, clear: () => toggle("authority", a) }),
    );
    filters.status.forEach((s) =>
      chips.push({ label: `Status: ${s}`, clear: () => toggle("status", s) }),
    );
    filters.severity.forEach((s) =>
      chips.push({ label: `Severity: ${s}`, clear: () => toggle("severity", s) }),
    );
    filters.triage.forEach((t) =>
      chips.push({ label: `Triage: ${t.replace("_", " ")}`, clear: () => toggle("triage", t) }),
    );
    filters.owner.forEach((o) =>
      chips.push({ label: `Owner: ${o}`, clear: () => toggle("owner", o) }),
    );
    if (filters.flaggedOnly)
      chips.push({ label: "Flagged only", clear: () => patch({ flaggedOnly: false }) });
    if (filters.overdueOnly)
      chips.push({ label: "Overdue only", clear: () => patch({ overdueOnly: false }) });
    if (debouncedSearch)
      chips.push({ label: `Search: ${debouncedSearch}`, clear: () => setSearchInput("") });
    return chips;
  }, [filters, debouncedSearch, toggle, patch]);

  const handleSort = (key: string) => {
    setFilters((current) => ({
      ...current,
      sort: key,
      order: current.sort === key && current.order === "desc" ? "asc" : "desc",
      page: 1,
    }));
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast.error("Nothing to export", "The current filters return no records.");
      return;
    }
    exportCsv("artixio-regulatory-updates", rows, [
      { header: "Reference", value: (r) => r.reference_code ?? "" },
      { header: "Regulatory update", value: (r) => r.title },
      { header: "Authority", value: (r) => r.authority.code },
      { header: "Directive status", value: (r) => r.status },
      { header: "Published", value: (r) => r.published_date ?? "" },
      { header: "Effective", value: (r) => r.effective_date ?? "" },
      { header: "Due date", value: (r) => r.next_due_date ?? "" },
      { header: "Owner", value: (r) => r.primary_owner ?? "" },
      { header: "Triage status", value: (r) => r.triage_status },
      { header: "Open items", value: (r) => r.open_item_count },
      { header: "Severity", value: (r) => r.flag_summary.max_severity ?? "" },
      { header: "Validation issues", value: (r) => r.flag_summary.total },
    ]);
    toast.success(`Exported ${rows.length} records`, "CSV downloaded.");
  };

  const handleSaveView = () => {
    const name = viewName.trim();
    if (!name) return;
    savedViews.add(name, effective);
    setSaveOpen(false);
    setViewName("");
    toast.success(`View "${name}" saved`, "Find it under Saved Views.");
  };

  // Keyboard triage: j/k walks rows, Enter opens, / focuses search.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || rows.length === 0) return;

      if (event.key === "Enter" && selectedId !== null) {
        navigate(`/updates/${selectedId}`);
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;
      event.preventDefault();
      const index = rows.findIndex((r) => r.id === selectedId);
      const next =
        event.key === "j"
          ? Math.min(index + 1, rows.length - 1)
          : Math.max(index - 1, 0);
      setSelectedId(rows[index === -1 ? 0 : next].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows, selectedId, navigate]);

  const sortArrow = (key: string) =>
    effective.sort === key ? (
      <span className="arrow">{effective.order === "desc" ? "↓" : "↑"}</span>
    ) : null;

  return (
    <>
      <PageHeader
        title="Regulatory Updates"
        eyebrow="Source register · incoming regulatory intelligence"
        subtitle="Triage and manage incoming regulatory intelligence"
        actions={
          <>
            <button className="btn" onClick={() => setSaveOpen(true)}>
              <Icons.bookmark /> Save View
            </button>
            <button className="btn" onClick={handleExport}>
              <Icons.download /> Export
            </button>
          </>
        }
      />

      <div className="page flush">
        <div>
          <div className="toolbar">
            <div className="search-field">
              <Icons.search />
              <input
                ref={searchRef}
                className="input"
                placeholder="Search updates, references, summaries…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <button
              className={showFilters ? "btn primary" : "btn"}
              onClick={() => setShowFilters((v) => !v)}
            >
              <Icons.filter /> Filter
              {activeChips.length > 0 && ` (${activeChips.length})`}
            </button>

            <button
              className={filters.flaggedOnly ? "btn primary" : "btn"}
              onClick={() => patch({ flaggedOnly: !filters.flaggedOnly })}
            >
              Flagged {counts ? `(${counts.flagged_directives})` : ""}
            </button>

            <button
              className={filters.overdueOnly ? "btn primary" : "btn"}
              onClick={() => patch({ overdueOnly: !filters.overdueOnly })}
            >
              Overdue
            </button>

            <div className="toolbar-spacer" />

            <span className="small muted">
              {data ? `${data.total} records` : "…"}
            </span>
          </div>

          {showFilters && (
            <div className="chipbar" style={{ gap: 14 }}>
              <FilterGroup
                title="Authority"
                options={(counts?.by_authority ?? []).map((b) => ({
                  key: b.key,
                  label: `${b.label} (${b.count})`,
                }))}
                selected={filters.authority}
                onToggle={(v) => toggle("authority", v)}
              />
              <FilterGroup
                title="Severity"
                options={SEVERITIES.map((s) => ({ key: s, label: s }))}
                selected={filters.severity}
                onToggle={(v) => toggle("severity", v as FlagSeverity)}
              />
              <FilterGroup
                title="Triage"
                options={TRIAGES.map((t) => ({ key: t, label: t.replace("_", " ") }))}
                selected={filters.triage}
                onToggle={(v) => toggle("triage", v as TriageStatus)}
              />
              <FilterGroup
                title="Directive status"
                options={DIRECTIVE_STATUSES.map((s) => ({ key: s, label: s }))}
                selected={filters.status}
                onToggle={(v) => toggle("status", v as DirectiveStatus)}
              />
              <FilterGroup
                title="Owner"
                options={(owners ?? []).map((o) => ({ key: o, label: o }))}
                selected={filters.owner}
                onToggle={(v) => toggle("owner", v)}
              />
            </div>
          )}

          {activeChips.length > 0 && (
            <div className="chipbar">
              {activeChips.map((chip, i) => (
                <span className="chip" key={i}>
                  {chip.label}
                  <button onClick={chip.clear} aria-label={`Remove ${chip.label}`}>
                    ×
                  </button>
                </span>
              ))}
              <button
                className="btn ghost sm"
                onClick={() => {
                  setFilters(EMPTY_UPDATE_FILTERS);
                  setSearchInput("");
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <div className="tablewrap">
          {isError ? (
            <EmptyState
              title="Could not load updates"
              body={(error as Error)?.message ?? "Unknown error"}
            />
          ) : isLoading && rows.length === 0 ? (
            <TableSkeleton rows={12} cols={9} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No records match these filters"
              body="Clear a filter or widen the search to see more."
            />
          ) : (
            <table>
              <colgroup>
                <col style={{ width: 3 }} />
                <col />
                <col style={{ width: 74 }} />
                <col style={{ width: 156 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 132 }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 74 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="gutter" />
                  <th className="sortable" onClick={() => handleSort("title")}>
                    Regulatory update {sortArrow("title")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("authority")}>
                    Authority {sortArrow("authority")}
                  </th>
                  <th>Directive</th>
                  <th className="sortable" onClick={() => handleSort("published_date")}>
                    Published {sortArrow("published_date")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("due_date")}>
                    Due date {sortArrow("due_date")}
                  </th>
                  <th className="sortable" onClick={() => handleSort("risk")}>
                    Severity {sortArrow("risk")}
                  </th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Validation</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <UpdateRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onSelect={() => setSelectedId(row.id)}
                    onOpen={() => navigate(`/updates/${row.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="tablefoot">
          <span>
            Page {data?.page ?? 1} of {data?.pages ?? 1}
          </span>
          <button
            className="btn sm"
            disabled={(data?.page ?? 1) <= 1}
            onClick={() => patch({ page: Math.max(1, (data?.page ?? 1) - 1) })}
          >
            Prev
          </button>
          <button
            className="btn sm"
            disabled={(data?.page ?? 1) >= (data?.pages ?? 1)}
            onClick={() => patch({ page: (data?.page ?? 1) + 1 })}
          >
            Next
          </button>
          <span className="toolbar-spacer" />
          <span>
            <kbd>j</kbd> <kbd>k</kbd> navigate · <kbd>enter</kbd> open · <kbd>/</kbd> search
          </span>
        </div>
      </div>

      {saveOpen && (
        <Modal
          title="Save current view"
          description="Stores the active filters and sort under a name you can return to."
          onClose={() => setSaveOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setSaveOpen(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!viewName.trim()}
                onClick={handleSaveView}
              >
                Save view
              </button>
            </>
          }
        >
          <Field label="View name">
            <input
              className="input"
              autoFocus
              placeholder="e.g. Critical EMA items overdue"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveView()}
            />
          </Field>
          <div className="small muted">
            {activeChips.length === 0
              ? "No filters active — this view will show all records."
              : `Captures ${activeChips.length} active filter(s).`}
          </div>
        </Modal>
      )}
    </>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div
        className="small faint"
        style={{ fontWeight: 700, letterSpacing: "0.05em", marginBottom: 4 }}
      >
        {title.toUpperCase()}
      </div>
      <div className="row wrap-row">
        {options.map((option) => (
          <button
            key={option.key}
            className={selected.includes(option.key) ? "btn primary sm" : "btn sm"}
            onClick={() => onToggle(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UpdateRow({
  row,
  selected,
  onSelect,
  onOpen,
}: {
  row: Directive;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const due = relativeDays(row.next_due_date);
  return (
    <tr
      /* `flagged` tints the whole row when unresolved issues exist, so a dirty
         record is visible while scanning rather than only on reaching the
         Validation column. */
      className={row.flag_summary.open > 0 ? "clickable flagged" : "clickable"}
      aria-selected={selected}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <td className="gutter">
        <div className={row.flag_summary.max_severity ? `sev-${row.flag_summary.max_severity}` : ""} />
      </td>
      <td title={row.title}>
        <span className={isUntitled(row.title) ? "cell-title untitled" : "cell-title"}>
          {row.title}
        </span>
      </td>
      <td>
        <span className="pill neutral">{row.authority.code}</span>
      </td>
      <td className="mono" title={row.reference_code ?? "no reference code"}>
        {row.reference_code ?? <span className="missing">— none —</span>}
      </td>
      <td className="mono">
        {row.published_date ?? <span className="missing">missing</span>}
      </td>
      <td>
        {row.next_due_date ? (
          <span className={row.overdue ? "overdue mono" : "mono"}>
            {row.next_due_date}
            {due && <span className="cell-sub"> · {due}</span>}
          </span>
        ) : (
          <span className="faint small">—</span>
        )}
      </td>
      <td>
        {row.flag_summary.max_severity ? (
          <span className={`pill ${row.flag_summary.max_severity.toLowerCase()}`}>
            <span className="led" />
            {row.flag_summary.max_severity}
          </span>
        ) : (
          <span className="faint small">—</span>
        )}
      </td>
      <td>
        <Owner name={row.primary_owner} />
      </td>
      <td>
        <TriageStatusPill status={row.triage_status} />
      </td>
      <td>
        <ValidationCell
          critical={row.flag_summary.critical}
          warning={row.flag_summary.warning}
          info={row.flag_summary.info}
          open={row.flag_summary.open}
        />
      </td>
      <td>
        <button
          className="btn sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          View
        </button>
      </td>
    </tr>
  );
}
