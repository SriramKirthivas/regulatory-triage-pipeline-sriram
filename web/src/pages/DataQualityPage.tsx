import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError, type FlagQuery, type FlagSeverity, type FlagRow } from "../api";
import { PageHeader } from "../components/PageHeader";
import {
  EmptyState,
  Icons,
  Pill,
  SeverityPill,
  Stat,
  TableSkeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { exportCsv } from "../lib/exportCsv";
import { formatDateTime } from "../lib/format";

/**
 * Data Quality — the corrupt-record register.
 *
 * This screen is the assignment's "visually identify flagged/corrupt data that
 * your backend caught", promoted from a badge to a first-class workspace. Every
 * row cites the field, the reason, and the value the source actually sent.
 */

type TabKey = "open" | "resolved" | "all";

export function DataQualityPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("open");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<FlagSeverity | "">("");

  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });

  const query = useMemo<FlagQuery>(
    () => ({
      state: tab,
      q: search || undefined,
      severity: severity ? [severity] : undefined,
      page_size: 200,
    }),
    [tab, search, severity],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["flags", query],
    queryFn: () => api.flags(query),
    placeholderData: (previous) => previous,
  });

  const { data: openTotal } = useQuery({
    queryKey: ["flags", "count", "open"],
    queryFn: () => api.flags({ state: "open", page_size: 1 }),
  });
  const { data: resolvedTotal } = useQuery({
    queryKey: ["flags", "count", "resolved"],
    queryFn: () => api.flags({ state: "resolved", page_size: 1 }),
  });

  const rows = data?.items ?? [];

  const bySeverity = (key: string) =>
    counts?.by_severity.find((b) => b.key === key)?.count ?? 0;

  const mutate = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "resolve" | "reopen" }) =>
      action === "resolve" ? api.resolveFlag(id) : api.reopenFlag(id),
    onSuccess: (_flag, vars) => {
      toast.success(
        vars.action === "resolve" ? "Issue acknowledged" : "Issue reopened",
        vars.action === "resolve"
          ? "Closed but kept on the record for audit."
          : "Back in the open queue.",
      );
    },
    onError: (error) => {
      toast.error(
        "Could not update flag",
        error instanceof ApiError ? error.message : "Unknown error.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["flags"] });
      queryClient.invalidateQueries({ queryKey: ["directives"] });
      queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Data Quality"
        eyebrow="Exception register · ingest validation findings"
        subtitle="Corrupt or invalid records caught by the ingestion pipeline"
        actions={
          <button
            className="btn"
            onClick={() => {
              if (rows.length === 0) {
                toast.error("Nothing to export");
                return;
              }
              exportCsv("artixio-data-quality", rows, [
                { header: "Severity", value: (r) => r.severity },
                { header: "Issue", value: (r) => r.issue },
                { header: "Field", value: (r) => r.field },
                { header: "Message", value: (r) => r.message },
                { header: "Source value", value: (r) => r.raw_value ?? "" },
                { header: "Directive", value: (r) => r.directive.reference_code ?? "" },
                { header: "Authority", value: (r) => r.directive.authority_code },
                { header: "Detected by", value: (r) => r.source },
                { header: "Detected at", value: (r) => r.detected_at },
                { header: "Resolved at", value: (r) => r.resolved_at ?? "" },
              ]);
              toast.success(`Exported ${rows.length} issues`);
            }}
          >
            <Icons.download /> Export
          </button>
        }
      />

      <Tabs
        tabs={[
          { key: "open", label: "Open", count: openTotal?.total },
          { key: "resolved", label: "Acknowledged", count: resolvedTotal?.total },
          { key: "all", label: "All" },
        ]}
        active={tab}
        onChange={(key) => setTab(key as TabKey)}
      />

      <div className="page">
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Stat
            label="Critical"
            value={bySeverity("CRITICAL")}
            tone={bySeverity("CRITICAL") > 0 ? "critical" : undefined}
            foot="block compliance scheduling"
          />
          <Stat label="Warning" value={bySeverity("WARNING")} foot="need review" />
          <Stat label="Info" value={bySeverity("INFO")} foot="repaired on ingest" />
          <Stat
            label="Affected records"
            value={counts?.flagged_directives ?? "–"}
            tone="brand"
            foot={`of ${counts?.total_directives ?? "–"} directives`}
          />
        </div>

        <div className="row wrap-row" style={{ marginBottom: 12 }}>
          <div className="search-field">
            <Icons.search />
            <input
              className="input"
              placeholder="Search issues, fields, source values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FlagSeverity | "")}
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="WARNING">Warning</option>
            <option value="INFO">Info</option>
          </select>
          <span className="toolbar-spacer" />
          <span className="small muted">{data ? `${data.total} issues` : "…"}</span>
        </div>

        <div className="tablewrap">
          {isLoading && rows.length === 0 ? (
            <TableSkeleton rows={10} cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No issues in this view"
              body={
                tab === "open"
                  ? "Every detected issue has been acknowledged."
                  : "Nothing to show yet."
              }
            />
          ) : (
            <table>
              <colgroup>
                <col style={{ width: 3 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 186 }} />
                <col style={{ width: 132 }} />
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 186 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="gutter" />
                  <th>Severity</th>
                  <th>Issue</th>
                  <th>Field</th>
                  <th>What the backend caught</th>
                  <th>Record</th>
                  <th>Raised by</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <FlagTableRow
                    key={row.id}
                    row={row}
                    busy={mutate.isPending && mutate.variables?.id === row.id}
                    onResolve={() => mutate.mutate({ id: row.id, action: "resolve" })}
                    onReopen={() => mutate.mutate({ id: row.id, action: "reopen" })}
                    onOpen={() => navigate(`/updates/${row.directive_id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function FlagTableRow({
  row,
  busy,
  onResolve,
  onReopen,
  onOpen,
}: {
  row: FlagRow;
  busy: boolean;
  onResolve: () => void;
  onReopen: () => void;
  onOpen: () => void;
}) {
  const resolved = row.resolved_at !== null;
  return (
    <tr className={resolved ? "" : undefined}>
      <td className="gutter">
        <div className={`sev-${row.severity}`} />
      </td>
      <td>
        <SeverityPill severity={row.severity} />
      </td>
      <td className="mono" title={row.issue}>
        {row.issue}
      </td>
      <td className="mono">{row.field}</td>
      <td title={row.message}>
        <span>{row.message}</span>
        {row.raw_value && (
          <span className="cell-sub"> · source sent: “{row.raw_value.slice(0, 40)}”</span>
        )}
      </td>
      <td className="mono" title={row.directive.title}>
        <span className="pill neutral">{row.directive.authority_code}</span>{" "}
        {row.directive.reference_code ?? "—"}
      </td>
      <td>
        {row.source === "MANUAL" ? (
          <Pill tone="brand">Manual</Pill>
        ) : (
          <span className="small faint">Pipeline</span>
        )}
      </td>
      <td>
        <div className="row" style={{ gap: 4 }}>
          {resolved ? (
            <button
              className="btn sm"
              disabled={busy}
              onClick={onReopen}
              title={`Acknowledged ${formatDateTime(row.resolved_at)}`}
            >
              Reopen
            </button>
          ) : (
            <button className="btn sm" disabled={busy} onClick={onResolve}>
              <Icons.check /> Acknowledge
            </button>
          )}
          <button className="btn sm" onClick={onOpen}>
            View
          </button>
        </div>
      </td>
    </tr>
  );
}
