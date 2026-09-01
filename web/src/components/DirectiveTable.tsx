import { useMemo } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { Directive, Filters } from "../api";

/**
 * The triage table.
 *
 * Sorting and filtering are server-side (TanStack Table renders; Postgres decides),
 * because the risk ordering depends on flag aggregates the client does not hold.
 */

interface Props {
  rows: Directive[];
  selectedId: number | null;
  filters: Filters;
  onSelect: (id: number) => void;
  onSort: (key: string) => void;
}

const columnHelper = createColumnHelper<Directive>();

/** A missing critical date is itself the signal — render the absence loudly. */
function DateCell({ value }: { value: string | null }) {
  if (!value) return <span className="date-missing">— missing</span>;
  return <span>{value}</span>;
}

export function DirectiveTable({ rows, selectedId, filters, onSelect, onSort }: Props) {
  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "gutter",
        header: () => null,
        cell: ({ row }) => {
          const severity = row.original.flag_summary.max_severity;
          return <div className={severity ? `sev-${severity}` : ""} />;
        },
      }),
      columnHelper.accessor("reference_code", {
        id: "reference_code",
        header: "Reference",
        cell: (info) => (
          <span className="ref">{info.getValue() ?? "— none —"}</span>
        ),
      }),
      columnHelper.accessor((row) => row.authority.code, {
        id: "authority",
        header: "Auth",
      }),
      columnHelper.accessor("title", {
        id: "title",
        header: "Directive",
        cell: (info) => {
          const title = info.getValue();
          const untitled = title.startsWith("[untitled");
          return (
            <span className={untitled ? "title-cell untitled" : "title-cell"}>
              {title}
            </span>
          );
        },
      }),
      columnHelper.accessor("status", {
        id: "status",
        header: "Status",
        cell: (info) => (
          <span className={`badge st-${info.getValue()}`}>
            {info.getValue().replace("_", " ")}
          </span>
        ),
      }),
      columnHelper.accessor("published_date", {
        id: "published_date",
        header: "Published",
        cell: (info) => <DateCell value={info.getValue()} />,
      }),
      columnHelper.accessor("effective_date", {
        id: "effective_date",
        header: "Effective",
        cell: (info) => <DateCell value={info.getValue()} />,
      }),
      columnHelper.accessor("open_item_count", {
        id: "open_items",
        header: "Open",
        cell: (info) => {
          const total = info.row.original.action_items.length;
          return (
            <span className="num">
              {info.getValue()}/{total}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: "flags",
        header: "Flags",
        cell: ({ row }) => {
          const f = row.original.flag_summary;
          if (f.total === 0) return <span className="fc-i">—</span>;
          return (
            <span className="flagcount" title={`${f.total} data-quality issue(s)`}>
              {f.critical > 0 && <i className="fc-c">{f.critical}C</i>}
              {f.warning > 0 && <i className="fc-w">{f.warning}W</i>}
              {f.info > 0 && <i className="fc-i">{f.info}I</i>}
            </span>
          );
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const SORTABLE = new Set([
    "reference_code",
    "authority",
    "title",
    "status",
    "published_date",
    "effective_date",
    "flags",
  ]);

  const sortKeyFor = (id: string) => (id === "flags" ? "risk" : id);

  return (
    <table>
      <colgroup>
        <col style={{ width: 4 }} />
        <col style={{ width: 170 }} />
        <col style={{ width: 52 }} />
        <col />
        <col style={{ width: 92 }} />
        <col style={{ width: 96 }} />
        <col style={{ width: 96 }} />
        <col style={{ width: 56 }} />
        <col style={{ width: 82 }} />
      </colgroup>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => {
              const id = header.column.id;
              const sortable = SORTABLE.has(id);
              const key = sortKeyFor(id);
              const isActive = filters.sort === key;
              return (
                <th
                  key={header.id}
                  className={
                    (id === "gutter" ? "gutter " : "") + (sortable ? "sortable" : "")
                  }
                  onClick={sortable ? () => onSort(key) : undefined}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {isActive && (
                    <span className="arrow">{filters.order === "desc" ? "↓" : "↑"}</span>
                  )}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            key={row.id}
            aria-selected={row.original.id === selectedId}
            onClick={() => onSelect(row.original.id)}
          >
            {row.getVisibleCells().map((cell) => (
              <td
                key={cell.id}
                className={cell.column.id === "gutter" ? "gutter" : undefined}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
