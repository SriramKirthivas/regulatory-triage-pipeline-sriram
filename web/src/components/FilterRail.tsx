import type { DirectiveStatus, Filters, FlagSeverity, MetaCounts } from "../api";

/**
 * The filter rail. Every option carries its own count, so the operator can see
 * where the volume is before clicking — that is the density win over a row of
 * summary tiles that show the same numbers and filter nothing.
 */

interface Props {
  counts?: MetaCounts;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

const SEVERITY_ORDER: FlagSeverity[] = ["CRITICAL", "WARNING", "INFO"];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function FilterRail({ counts, filters, onChange, onReset }: Props) {
  const severityCount = (key: FlagSeverity) =>
    counts?.by_severity.find((b) => b.key === key)?.count ?? 0;

  const active =
    filters.authority.length > 0 ||
    filters.status.length > 0 ||
    filters.severity.length > 0 ||
    filters.flaggedOnly ||
    filters.hasOpenItems ||
    filters.q.length > 0;

  return (
    <nav className="rail" aria-label="Filters">
      <div className="rail-group">
        <div className="rail-title">Triage</div>
        <button
          className="rail-item"
          aria-pressed={filters.flaggedOnly}
          onClick={() => onChange({ flaggedOnly: !filters.flaggedOnly, page: 1 })}
        >
          Flagged only
          <span className="count">{counts?.flagged_directives ?? "–"}</span>
        </button>
        <button
          className="rail-item"
          aria-pressed={filters.hasOpenItems}
          onClick={() => onChange({ hasOpenItems: !filters.hasOpenItems, page: 1 })}
        >
          Has open items
          <span className="count">{counts?.open_action_items ?? "–"}</span>
        </button>
      </div>

      <div className="rail-group">
        <div className="rail-title">Data quality</div>
        {SEVERITY_ORDER.map((severity) => (
          <button
            key={severity}
            className="rail-item"
            aria-pressed={filters.severity.includes(severity)}
            onClick={() =>
              onChange({ severity: toggle(filters.severity, severity), page: 1 })
            }
          >
            <span className={`dot sev-${severity}`} />
            {severity.charAt(0) + severity.slice(1).toLowerCase()}
            <span className="count">{severityCount(severity)}</span>
          </button>
        ))}
      </div>

      <div className="rail-group">
        <div className="rail-title">Authority</div>
        {counts?.by_authority.map((bucket) => (
          <button
            key={bucket.key}
            className="rail-item"
            aria-pressed={filters.authority.includes(bucket.key)}
            onClick={() =>
              onChange({ authority: toggle(filters.authority, bucket.key), page: 1 })
            }
          >
            {bucket.label}
            <span className="count">{bucket.count}</span>
          </button>
        ))}
      </div>

      <div className="rail-group">
        <div className="rail-title">Directive status</div>
        {counts?.by_status.map((bucket) => (
          <button
            key={bucket.key}
            className="rail-item"
            aria-pressed={filters.status.includes(bucket.key as DirectiveStatus)}
            onClick={() =>
              onChange({
                status: toggle(filters.status, bucket.key as DirectiveStatus),
                page: 1,
              })
            }
          >
            {bucket.label}
            <span className="count">{bucket.count}</span>
          </button>
        ))}
      </div>

      {active && (
        <button className="reset" onClick={onReset}>
          Clear all filters
        </button>
      )}
    </nav>
  );
}
