import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api, EMPTY_UPDATE_FILTERS, type DirectiveStatus } from "../api";
import { PageHeader } from "../components/PageHeader";
import {
  DirectiveStatusPill,
  EmptyState,
  Icons,
  TableSkeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { exportCsv } from "../lib/exportCsv";
import { isUntitled } from "../lib/format";

/**
 * Directives — the regulatory documents themselves, grouped by lifecycle state.
 *
 * Where Updates is a work queue ordered by risk, this is the reference library:
 * "what has this authority published, and is it still in force?"
 */
export function DirectivesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<DirectiveStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });

  const filters = useMemo(
    () => ({
      ...EMPTY_UPDATE_FILTERS,
      q: search,
      status: tab === "ALL" ? [] : [tab],
      sort: "published_date",
      order: "desc" as const,
    }),
    [tab, search],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["directives", "library", filters],
    queryFn: () => api.directives(filters),
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];

  const tabs = [
    { key: "ALL", label: "All", count: counts?.total_directives },
    ...(counts?.by_status ?? []).map((b) => ({
      key: b.key,
      label: b.label,
      count: b.count,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Compliance Directives"
        eyebrow="Document library · lifecycle register"
        subtitle="Every directive on record, grouped by lifecycle state"
        actions={
          <button
            className="btn"
            onClick={() => {
              if (rows.length === 0) {
                toast.error("Nothing to export");
                return;
              }
              exportCsv("artixio-directives", rows, [
                { header: "Reference", value: (r) => r.reference_code ?? "" },
                { header: "Title", value: (r) => r.title },
                { header: "Authority", value: (r) => r.authority.code },
                { header: "Status", value: (r) => r.status },
                { header: "Type", value: (r) => r.document_type ?? "" },
                { header: "Therapeutic area", value: (r) => r.therapeutic_area ?? "" },
                { header: "Published", value: (r) => r.published_date ?? "" },
                { header: "Effective", value: (r) => r.effective_date ?? "" },
                { header: "Action items", value: (r) => r.action_items.length },
              ]);
              toast.success(`Exported ${rows.length} directives`);
            }}
          >
            <Icons.download /> Export
          </button>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={(key) => setTab(key as DirectiveStatus | "ALL")} />

      <div className="page">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="search-field">
            <Icons.search />
            <input
              className="input"
              placeholder="Search directives…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="small muted">{data ? `${data.total} directives` : "…"}</span>
        </div>

        <div className="tablewrap">
          {isLoading && rows.length === 0 ? (
            <TableSkeleton rows={10} cols={8} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No directives here"
              body="Try a different lifecycle state or clear the search."
            />
          ) : (
            <table>
              <colgroup>
                <col style={{ width: 158 }} />
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 108 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 76 }} />
                <col style={{ width: 74 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Directive</th>
                  <th>Auth</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Published</th>
                  <th>Effective</th>
                  <th className="right">Items</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="clickable"
                    onClick={() => navigate(`/updates/${row.id}`)}
                  >
                    <td className="mono">
                      {row.reference_code ?? <span className="missing">— none —</span>}
                    </td>
                    <td title={row.title}>
                      <span className={isUntitled(row.title) ? "cell-title untitled" : "cell-title"}>
                        {row.title}
                      </span>
                      {row.therapeutic_area && (
                        <span className="cell-sub"> · {row.therapeutic_area}</span>
                      )}
                    </td>
                    <td>
                      <span className="pill neutral">{row.authority.code}</span>
                    </td>
                    <td>
                      <DirectiveStatusPill status={row.status} />
                    </td>
                    <td className="muted">{row.document_type ?? "—"}</td>
                    <td className="mono">
                      {row.published_date ?? <span className="missing">missing</span>}
                    </td>
                    <td className="mono">
                      {row.effective_date ?? <span className="missing">missing</span>}
                    </td>
                    <td className="right num">
                      {row.open_item_count}
                      <span className="cell-sub">/{row.action_items.length}</span>
                    </td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/updates/${row.id}`);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
