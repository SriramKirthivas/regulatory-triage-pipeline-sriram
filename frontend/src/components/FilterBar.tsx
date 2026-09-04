import { forwardRef } from "react";
import type { AnomalySummary, Authority, Filters, ItemStatus, Severity } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

const STATUSES: ItemStatus[] = ["pending", "in_progress", "blocked", "resolved", "unknown"];
const SEVERITIES: Severity[] = ["critical", "major", "minor", "info", "unknown"];

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  authorities: Authority[];
  summary?: AnomalySummary;
  shown: number;
  total: number;
}

export const FilterBar = forwardRef<HTMLInputElement, Props>(function FilterBar(
  { filters, onChange, authorities, summary, shown, total },
  searchRef,
) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleStatus = (s: ItemStatus) =>
    set({ status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s] });
  const dirty =
    filters.q || filters.status.length || filters.authority_id != null || filters.severity || filters.flagged != null || filters.errors_only;

  return (
    <div className="filterbar">
      <label className="search">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          ref={searchRef}
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search title, reference, owner"
          onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), set({ q: "" }))}
        />
        <kbd>/</kbd>
      </label>

      <div className="chipset" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`chip${filters.status.includes(s) ? " on" : ""}${s === "unknown" ? " tone-error" : ""}`}
            onClick={() => toggleStatus(s)}
          >
            {STATUS_LABEL[s]}
            {summary && <span className="n">{summary.by_status[s] ?? 0}</span>}
          </button>
        ))}
      </div>

      <select className="select" value={filters.authority_id ?? ""} onChange={(e) => set({ authority_id: e.target.value ? Number(e.target.value) : null })}>
        <option value="">All authorities</option>
        {authorities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.acronym} ({a.jurisdiction})
          </option>
        ))}
      </select>

      <select className="select" value={filters.severity ?? ""} onChange={(e) => set({ severity: (e.target.value || null) as Severity | null })}>
        <option value="">Any severity</option>
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {dirty ? (
        <button className="filter-clear" onClick={() => onChange({ q: "", status: [], authority_id: null, severity: null, flagged: null, errors_only: false })}>
          Clear
        </button>
      ) : null}

      <span className="result-count">
        {shown === total ? `${total} items` : `${shown} of ${total}`}
      </span>
    </div>
  );
});
