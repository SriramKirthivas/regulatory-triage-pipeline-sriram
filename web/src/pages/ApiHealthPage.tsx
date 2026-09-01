import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Icons, Pill, Stat } from "../components/ui";
import { formatDateTime } from "../lib/format";

/**
 * API Health — backend and database status.
 *
 * The endpoint behind this screen never throws: an unreachable database is a
 * reported state, not a 500, because a health check that dies when things break
 * is worthless exactly when it matters.
 */
export function ApiHealthPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
  });

  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });

  const healthy = data?.status === "ok";

  return (
    <>
      <PageHeader
        title="API Health"
        subtitle="Backend service and database status"
        actions={
          <button
            className="btn"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["health"] });
              queryClient.invalidateQueries({ queryKey: ["counts"] });
            }}
          >
            <Icons.refresh /> Refresh
          </button>
        }
      />

      <div className="page">
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="label">Service</div>
            <div className="value" style={{ fontSize: 15, paddingTop: 5 }}>
              {isLoading ? (
                <span className="faint small">Checking…</span>
              ) : isError || !data ? (
                <Pill tone="critical">Unreachable</Pill>
              ) : healthy ? (
                <Pill tone="success">Operational</Pill>
              ) : (
                <Pill tone="warning">Degraded</Pill>
              )}
            </div>
            <div className="foot">FastAPI v{data?.version ?? "—"}</div>
          </div>

          <div className="stat">
            <div className="label">Database</div>
            <div className="value" style={{ fontSize: 15, paddingTop: 5 }}>
              {data?.database === "reachable" ? (
                <Pill tone="success">Reachable</Pill>
              ) : (
                <Pill tone="critical">Unreachable</Pill>
              )}
            </div>
            <div className="foot">PostgreSQL 16</div>
          </div>

          <Stat
            label="Query latency"
            value={data?.latency_ms !== null && data?.latency_ms !== undefined ? `${data.latency_ms} ms` : "—"}
            foot="round trip on SELECT 1"
            tone="brand"
          />

          <Stat
            label="Last checked"
            value={
              <span style={{ fontSize: 13, fontWeight: 550 }}>
                {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—"}
              </span>
            }
            foot="auto-refresh every 15s"
          />
        </div>

        <div className="grid cols-2">
          <div className="card">
            <div className="card-head">
              <h2>Table row counts</h2>
              <span className="sub">live from the database</span>
            </div>
            <div className="card-body">
              {data?.tables.length ? (
                <table>
                  <tbody>
                    {data.tables.map((t) => (
                      <tr key={t.table}>
                        <td className="mono">{t.table}</td>
                        <td className="right num" style={{ width: 90 }}>
                          {t.rows.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <span className="faint small">No data — the database is unreachable.</span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Ingest pipeline</h2>
              <span className="sub">issues detected by severity</span>
            </div>
            <div className="card-body">
              {data && Object.keys(data.ingest).length > 0 ? (
                <>
                  <table>
                    <tbody>
                      {(["CRITICAL", "WARNING", "INFO"] as const).map((severity) => (
                        <tr key={severity}>
                          <td>
                            <span className={`pill ${severity.toLowerCase()}`}>
                              <span className="led" />
                              {severity}
                            </span>
                          </td>
                          <td className="right num" style={{ width: 90 }}>
                            {data.ingest[severity] ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="small muted" style={{ marginTop: 10 }}>
                    {counts?.flagged_directives ?? "–"} of {counts?.total_directives ?? "–"}{" "}
                    directives carry at least one detected issue. Records are never
                    dropped — defects are stored alongside the data.
                  </div>
                </>
              ) : (
                <span className="faint small">No ingest data available.</span>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-head">
            <h2>Endpoints</h2>
          </div>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 74 }}>Method</th>
                  <th style={{ width: 300 }}>Path</th>
                  <th>Purpose</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["GET", "/api/directives", "Filter, sort and paginate the update queue"],
                  ["GET", "/api/directives/{id}", "Full record with flags and raw payload"],
                  ["POST", "/api/directives/{id}/action-items", "Create tracked work"],
                  ["POST", "/api/directives/{id}/flags", "Raise a manual data-quality issue"],
                  ["POST", "/api/directives/{id}/revalidate", "Re-run ingest rules on the raw payload"],
                  ["GET", "/api/action-items", "Work across all directives"],
                  ["PATCH", "/api/action-items/{id}", "Change status, owner, priority or due date"],
                  ["GET", "/api/flags", "The corrupt-record register"],
                  ["POST", "/api/flags/{id}/resolve", "Acknowledge an issue"],
                  ["GET", "/api/meta/counts", "Aggregates for filters and nav badges"],
                  ["GET", "/health", "This page"],
                ].map(([method, path, purpose]) => (
                  <tr key={path + method}>
                    <td>
                      <span className={method === "GET" ? "pill info" : "pill brand"}>
                        {method}
                      </span>
                    </td>
                    <td className="mono">{path}</td>
                    <td className="muted">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="small faint" style={{ marginTop: 10 }}>
              Interactive documentation is served at{" "}
              <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
                localhost:8000/docs
              </a>
              . Last server timestamp: {formatDateTime(data?.checked_at ?? null)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
