import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DetailPanel } from "../components/DetailPanel";
import { FilterBar } from "../components/FilterBar";
import { useToast } from "../components/Toast";
import { TriageTable } from "../components/TriageTable";
import { ApiError, api, buildQuery } from "../lib/api";
import type { ActionItem, Filters, Page, WritableStatus } from "../lib/types";
import { STATUS_LABEL, WRITABLE } from "../lib/types";

const EMPTY: Filters = { q: "", status: [], authority_id: null, severity: null, flagged: null, errors_only: false };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Triage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, errors_only: params.get("errors") === "1" });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ id: number; n: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const effective = useDebounced(filters, 180);
  const key = useMemo(() => ["items", buildQuery(effective)] as const, [effective]);

  const items = useQuery({ queryKey: key, queryFn: () => api.items(effective), placeholderData: (prev) => prev });
  const authorities = useQuery({ queryKey: ["authorities"], queryFn: api.authorities, staleTime: Infinity });
  const summary = useQuery({ queryKey: ["anomalies"], queryFn: api.anomalies });

  const rows = items.data?.items ?? [];
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: WritableStatus }) => api.setStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Page>(key);
      qc.setQueryData<Page>(key, (p) =>
        p ? { ...p, items: p.items.map((r) => (r.id === id ? { ...r, status, status_raw: status } : r)) } : p,
      );
      return { prev };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast({ tone: "error", text: err instanceof ApiError ? err.userMessage : "Update failed", code: `#${vars.id}` });
    },
    onSuccess: (data: ActionItem) => {
      qc.setQueryData<Page>(key, (p) => (p ? { ...p, items: p.items.map((r) => (r.id === data.id ? data : r)) } : p));
      setFlash((f) => ({ id: data.id, n: (f?.n ?? 0) + 1 }));
      toast({ tone: "ok", text: `Marked ${STATUS_LABEL[data.status].toLowerCase()}`, code: `#${data.id}` });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["anomalies"] });
    },
  });

  const setStatus = useCallback(
    (s: WritableStatus) => {
      if (selected && selected.status !== s) mutation.mutate({ id: selected.id, status: s });
    },
    [selected, mutation],
  );

  // keyboard: j/k move, 1-4 status, f flagged, e errors, / search, esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = rows.findIndex((r) => r.id === selectedId);
      const move = (d: number) => {
        const next = rows[Math.min(rows.length - 1, Math.max(0, (idx < 0 ? (d > 0 ? -1 : rows.length) : idx) + d))];
        if (next) {
          setSelectedId(next.id);
          document.querySelector(`tr[data-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      };
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          move(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          move(-1);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "Escape":
          setSelectedId(null);
          break;
        case "f":
          setFilters((f) => ({ ...f, flagged: f.flagged === true ? null : true, errors_only: false }));
          break;
        case "e":
          setFilters((f) => ({ ...f, errors_only: !f.errors_only, flagged: null }));
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (selected) setStatus(WRITABLE[Number(e.key) - 1]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selectedId, selected, setStatus]);

  const s = summary.data;

  return (
    <div className={`shell${selected ? " has-panel" : ""}`}>
      <header className="topbar">
        <div className="brand">
          Triage <small>every open action item, ranked by priority</small>
        </div>
        <div className="counters">
          {s && (
            <>
              <button
                className={`counter link err${filters.errors_only ? " on" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, errors_only: !f.errors_only, flagged: null }))}
                title="Show only records the backend quarantined or could not repair (e)"
              >
                <b>{s.items_with_errors}</b> need review
              </button>
              <button
                className={`counter link warn${filters.flagged === true ? " on" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, flagged: f.flagged === true ? null : true, errors_only: false }))}
                title="Show every record with at least one backend flag (f)"
              >
                <b>{s.items_with_errors + s.items_with_warnings}</b> flagged
              </button>
            </>
          )}
        </div>
        <span className="kbd-hint">
          <kbd>j</kbd> <kbd>k</kbd> move, <kbd>1</kbd> to <kbd>4</kbd> set status, <kbd>f</kbd> flagged
        </span>
      </header>

      <FilterBar
        ref={searchRef}
        filters={filters}
        onChange={setFilters}
        authorities={authorities.data ?? []}
        summary={s}
        shown={rows.length}
        total={s?.total_items ?? rows.length}
      />

      <div style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <AnimatePresence>
          {items.isFetching && (
            <motion.div
              className="loadbar"
              initial={{ width: "0%" }}
              animate={{ width: "70%" }}
              exit={{ width: "100%", opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        {items.isError ? (
          <div className="empty">
            <b>Could not reach the API</b>
            Start the backend on port 8787 and reload. {(items.error as Error).message}
          </div>
        ) : (
          <TriageTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} flash={flash} />
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <DetailPanel
            key={selected.id}
            item={selected}
            busy={mutation.isPending}
            onStatus={setStatus}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ToastProvider is mounted at the app root, not here — see the comment in App.tsx.
export default function TriagePage() {
  return <Triage />;
}
