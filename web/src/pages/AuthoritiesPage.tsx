import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, EMPTY_UPDATE_FILTERS } from "../api";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, Icons, Stat, TableSkeleton, useToast } from "../components/ui";
import { exportCsv } from "../lib/exportCsv";

/**
 * Authorities — the issuing bodies, ranked by how much attention they demand.
 *
 * Clicking through pre-filters the Updates queue rather than opening a dead-end
 * detail page: the useful question about an authority is always "what of theirs
 * needs work?"
 */
export function AuthoritiesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["authorities"],
    queryFn: api.authorities,
  });

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, a) => ({
      directives: acc.directives + a.directive_count,
      open: acc.open + a.open_action_items,
      critical: acc.critical + a.critical_flag_count,
    }),
    { directives: 0, open: 0, critical: 0 },
  );

  const openQueue = (code: string) =>
    navigate("/updates", {
      state: { filters: { ...EMPTY_UPDATE_FILTERS, authority: [code] } },
    });

  return (
    <>
      <PageHeader
        title="Regulatory Authorities"
        eyebrow="Issuing bodies · portfolio and workload"
        subtitle="Issuing bodies and the volume of work each one generates"
        actions={
          <button
            className="btn"
            onClick={() => {
              if (rows.length === 0) {
                toast.error("Nothing to export");
                return;
              }
              exportCsv("artixio-authorities", rows, [
                { header: "Code", value: (r) => r.code },
                { header: "Name", value: (r) => r.name },
                { header: "Jurisdiction", value: (r) => r.jurisdiction },
                { header: "Region", value: (r) => r.region },
                { header: "Directives", value: (r) => r.directive_count },
                { header: "Action items", value: (r) => r.action_item_count },
                { header: "Open items", value: (r) => r.open_action_items },
                { header: "Validation issues", value: (r) => r.flag_count },
                { header: "Critical issues", value: (r) => r.critical_flag_count },
                { header: "Latest published", value: (r) => r.latest_published ?? "" },
              ]);
              toast.success(`Exported ${rows.length} authorities`);
            }}
          >
            <Icons.download /> Export
          </button>
        }
      />

      <div className="page">
        <div className="grid cols-4" style={{ marginBottom: 14 }}>
          <Stat label="Authorities" value={rows.length} foot="issuing bodies tracked" />
          <Stat label="Directives" value={totals.directives} foot="across all authorities" />
          <Stat label="Open action items" value={totals.open} tone="brand" foot="awaiting work" />
          <Stat
            label="Critical issues"
            value={totals.critical}
            tone={totals.critical > 0 ? "critical" : undefined}
            foot="caught on ingest"
          />
        </div>

        <div className="tablewrap">
          {isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState title="No authorities" body="Seed the database to populate this view." />
          ) : (
            <table>
              <colgroup>
                <col style={{ width: 78 }} />
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 118 }} />
                <col style={{ width: 96 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Authority</th>
                  <th>Jurisdiction</th>
                  <th>Region</th>
                  <th className="right">Directives</th>
                  <th className="right">Open items</th>
                  <th>Validation load</th>
                  <th>Latest published</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((authority) => {
                  const load = authority.flag_count
                    ? Math.min(100, (authority.critical_flag_count / authority.flag_count) * 100)
                    : 0;
                  return (
                    <tr
                      key={authority.id}
                      className="clickable"
                      onClick={() => openQueue(authority.code)}
                    >
                      <td>
                        <span className="pill brand">{authority.code}</span>
                      </td>
                      <td className="cell-title" title={authority.name}>
                        {authority.name}
                      </td>
                      <td className="muted">{authority.jurisdiction}</td>
                      <td className="muted">{authority.region}</td>
                      <td className="right num">{authority.directive_count}</td>
                      <td className="right num">
                        {authority.open_action_items}
                        <span className="cell-sub"> / {authority.action_item_count}</span>
                      </td>
                      <td>
                        <div className="row">
                          <div className="progress" style={{ flex: 1, minWidth: 40 }}>
                            <div
                              className={load > 0 ? "bar-critical" : ""}
                              style={{ width: `${authority.flag_count ? Math.max(load, 6) : 0}%` }}
                            />
                          </div>
                          <span className="small mono">
                            {authority.critical_flag_count}C / {authority.flag_count}
                          </span>
                        </div>
                      </td>
                      <td className="mono">
                        {authority.latest_published ?? <span className="faint">—</span>}
                      </td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openQueue(authority.code);
                          }}
                        >
                          View queue
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
