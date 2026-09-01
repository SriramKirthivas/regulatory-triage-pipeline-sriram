import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ACTION_STATUSES,
  api,
  ApiError,
  type ActionItemQuery,
  type ActionItemRow,
  type ActionItemStatus,
} from "../api";
import { PageHeader } from "../components/PageHeader";
import {
  EmptyState,
  Icons,
  TableSkeleton,
  Tabs,
  useToast,
} from "../components/ui";
import { exportCsv } from "../lib/exportCsv";
import { label, relativeDays } from "../lib/format";

/**
 * Action Items — assigned work across every directive.
 *
 * Status and owner are editable inline: this is the screen where someone works a
 * personal queue, and forcing them into a record detail page for each change
 * would be the wrong shape.
 */

type TabKey = "open" | "overdue" | "unassigned" | "all";

const TAB_QUERY: Record<TabKey, Partial<ActionItemQuery>> = {
  open: { open_only: true },
  overdue: { overdue_only: true },
  unassigned: { unassigned_only: true, open_only: true },
  all: {},
};

export function ActionItemsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("open");
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");

  const { data: owners } = useQuery({ queryKey: ["owners"], queryFn: api.owners });

  const query = useMemo<ActionItemQuery>(
    () => ({
      ...TAB_QUERY[tab],
      q: search || undefined,
      owner: owner ? [owner] : undefined,
      sort: "due_date",
      order: "asc",
      page_size: 200,
    }),
    [tab, search, owner],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["actionItems", query],
    queryFn: () => api.actionItems(query),
    placeholderData: (previous) => previous,
  });

  // Counts for the tab strip, fetched cheaply with page_size=1.
  const { data: openCount } = useQuery({
    queryKey: ["actionItems", "count", "open"],
    queryFn: () => api.actionItems({ open_only: true, page_size: 1 }),
  });
  const { data: overdueCount } = useQuery({
    queryKey: ["actionItems", "count", "overdue"],
    queryFn: () => api.actionItems({ overdue_only: true, page_size: 1 }),
  });
  const { data: unassignedCount } = useQuery({
    queryKey: ["actionItems", "count", "unassigned"],
    queryFn: () => api.actionItems({ unassigned_only: true, open_only: true, page_size: 1 }),
  });

  const rows = data?.items ?? [];

  const update = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: Parameters<typeof api.updateActionItem>[1];
    }) => api.updateActionItem(id, patch),
    onSuccess: (item) => {
      toast.success("Action item updated", `${item.title.slice(0, 60)} → ${label(item.status)}`);
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError && error.status === 409 ? "Transition refused" : "Update failed",
        error instanceof ApiError ? error.message : "Could not reach the server.",
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["actionItems"] });
      queryClient.invalidateQueries({ queryKey: ["directives"] });
      queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  return (
    <>
      <PageHeader
        title="Action Items"
        subtitle="Assigned work and resolution tracking across all directives"
        actions={
          <button
            className="btn"
            onClick={() => {
              if (rows.length === 0) {
                toast.error("Nothing to export");
                return;
              }
              exportCsv("artixio-action-items", rows, [
                { header: "Item", value: (r) => r.title },
                { header: "Directive", value: (r) => r.directive.reference_code ?? "" },
                { header: "Authority", value: (r) => r.directive.authority_code },
                { header: "Owner", value: (r) => r.owner ?? "" },
                { header: "Status", value: (r) => r.status },
                { header: "Priority", value: (r) => r.priority },
                { header: "Due date", value: (r) => r.due_date ?? "" },
                { header: "Overdue", value: (r) => (r.overdue ? "yes" : "no") },
              ]);
              toast.success(`Exported ${rows.length} action items`);
            }}
          >
            <Icons.download /> Export
          </button>
        }
      />

      <Tabs
        tabs={[
          { key: "open", label: "Open", count: openCount?.total },
          { key: "overdue", label: "Overdue", count: overdueCount?.total },
          { key: "unassigned", label: "Unassigned", count: unassignedCount?.total },
          { key: "all", label: "All" },
        ]}
        active={tab}
        onChange={(key) => setTab(key as TabKey)}
      />

      <div className="page">
        <div className="row wrap-row" style={{ marginBottom: 12 }}>
          <div className="search-field">
            <Icons.search />
            <input
              className="input"
              placeholder="Search action items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            aria-label="Filter by owner"
          >
            <option value="">All owners</option>
            {(owners ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <span className="toolbar-spacer" />
          <span className="small muted">{data ? `${data.total} items` : "…"}</span>
        </div>

        <div className="tablewrap">
          {isLoading && rows.length === 0 ? (
            <TableSkeleton rows={10} cols={7} />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing here"
              body="No action items match this tab and filter combination."
            />
          ) : (
            <table>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 132 }} />
                <col style={{ width: 92 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Action item</th>
                  <th>Directive</th>
                  <th>Auth</th>
                  <th>Owner</th>
                  <th>Priority</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ItemRow
                    key={row.id}
                    row={row}
                    owners={owners ?? []}
                    busy={update.isPending && update.variables?.id === row.id}
                    onPatch={(patch) => update.mutate({ id: row.id, patch })}
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

function ItemRow({
  row,
  owners,
  busy,
  onPatch,
  onOpen,
}: {
  row: ActionItemRow;
  owners: string[];
  busy: boolean;
  onPatch: (patch: { status?: ActionItemStatus; owner?: string | null }) => void;
  onOpen: () => void;
}) {
  const done = row.status === "RESOLVED" || row.status === "DISMISSED";
  return (
    <tr>
      <td title={row.title}>
        <span className="cell-title">{row.title}</span>
        {row.flag_count > 0 && (
          <span className="cell-sub"> · {row.flag_count} flag(s)</span>
        )}
      </td>
      <td className="mono" title={row.directive.title}>
        {row.directive.reference_code ?? <span className="missing">— none —</span>}
      </td>
      <td>
        <span className="pill neutral">{row.directive.authority_code}</span>
      </td>
      <td>
        <select
          className="select"
          style={{ height: 24, width: "100%" }}
          value={row.owner ?? ""}
          disabled={busy}
          onChange={(e) => onPatch({ owner: e.target.value || null })}
          aria-label={`Owner for ${row.title}`}
        >
          <option value="">Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className={`prio-${row.priority}`}>{label(row.priority)}</span>
      </td>
      <td>
        {row.due_date ? (
          <span className={row.overdue ? "overdue mono" : "mono"}>
            {row.due_date}
            <span className="cell-sub"> · {relativeDays(row.due_date)}</span>
          </span>
        ) : (
          <span className="faint small">no due date</span>
        )}
      </td>
      <td>
        <select
          className="select"
          style={{ height: 24, width: "100%" }}
          value={row.status}
          disabled={busy}
          onChange={(e) => onPatch({ status: e.target.value as ActionItemStatus })}
          aria-label={`Status for ${row.title}`}
        >
          {ACTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {label(status)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="row" style={{ gap: 4 }}>
          {!done && (
            <button
              className="btn sm"
              disabled={busy}
              onClick={() => onPatch({ status: "RESOLVED" })}
              title="Resolve this item"
            >
              <Icons.check />
            </button>
          )}
          <button className="btn sm" onClick={onOpen} title="Open directive">
            View
          </button>
        </div>
      </td>
    </tr>
  );
}
