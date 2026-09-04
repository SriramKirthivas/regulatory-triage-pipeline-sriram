import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { ActionItem } from "../lib/types";
import { Marks, Pill, Priority, Sev, dueClass, fmtDate } from "./Bits";

interface Props {
  rows: ActionItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  flash: { id: number; n: number } | null;
}

export function TriageTable({ rows, selectedId, onSelect, flash }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "priority", desc: false }]);

  const columns = useMemo<ColumnDef<ActionItem>[]>(
    () => [
      { id: "id", header: "#", accessorKey: "id", size: 56, cell: (c) => <span className="cell-id">{c.getValue<number>()}</span> },
      {
        id: "priority",
        header: "Pri",
        accessorKey: "priority",
        size: 64,
        cell: (c) => <Priority value={c.getValue<number>()} />,
      },
      {
        id: "title",
        header: "Action item",
        accessorFn: (r) => r.title ?? "",
        size: 380,
        cell: ({ row }) =>
          row.original.title ? (
            <span className="cell-title">{row.original.title}</span>
          ) : (
            <span className="cell-title missing">No usable title</span>
          ),
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        size: 122,
        cell: ({ row }) => (
          <motion.span layout key={row.original.status} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 600, damping: 30 }} style={{ display: "inline-block" }}>
            <Pill status={row.original.status} />
          </motion.span>
        ),
      },
      {
        id: "due",
        header: "Due",
        accessorKey: "due_date",
        size: 114,
        sortUndefined: "last",
        cell: ({ row }) =>
          row.original.due_date ? (
            <span className={`num ${dueClass(row.original.due_date, row.original.status)}`}>{fmtDate(row.original.due_date)}</span>
          ) : (
            <span className="muted">none</span>
          ),
      },
      { id: "owner", header: "Owner", accessorFn: (r) => r.owner ?? "", size: 110, cell: ({ row }) => row.original.owner ?? <span className="muted">unassigned</span> },
      {
        id: "ref",
        header: "Directive",
        accessorFn: (r) => r.directive.reference_code,
        size: 330,
        cell: ({ row }) => (
          <>
            <span className="ref">{row.original.directive.reference_code}</span>
            <span className="cell-sub">{row.original.directive.title ?? "untitled"}</span>
          </>
        ),
      },
      { id: "sev", header: "Sev", accessorFn: (r) => r.directive.severity, size: 84, cell: ({ row }) => <Sev value={row.original.directive.severity} /> },
      {
        id: "flags",
        header: "Backend flags",
        accessorFn: (r) => r.flags.length + r.directive.flags.length,
        size: 300,
        cell: ({ row }) => <Marks flags={[...row.original.flags, ...row.original.directive.flags]} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => String(r.id),
  });

  if (!rows.length) {
    return (
      <div className="table-wrap">
        <div className="empty">
          <b>Nothing matches these filters</b>
          Widen the status or authority filters, or clear the search.
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="triage">
        <colgroup>
          {table.getAllLeafColumns().map((c) => (
            <col key={c.id} style={{ width: c.getSize() }} />
          ))}
        </colgroup>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const dir = h.column.getIsSorted();
                return (
                  <th key={h.id} className={h.column.getCanSort() ? "sortable" : ""} onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {dir && <span className={`sort${dir === "desc" ? " desc" : ""}`}>▲</span>}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const r = row.original;
            const fault = r.has_errors || r.directive.has_errors;
            const cls = `row${r.id === selectedId ? " active" : ""}${fault ? " fault" : ""}`;
            return (
              <tr
                key={flash && flash.id === r.id ? `${row.id}-${flash.n}` : row.id}
                data-id={r.id}
                className={cls + (flash && flash.id === r.id ? " flash" : "")}
                onClick={() => onSelect(r.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
