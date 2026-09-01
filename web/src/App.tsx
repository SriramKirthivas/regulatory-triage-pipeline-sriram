import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, EMPTY_FILTERS, type Filters } from "./api";
import { DetailPanel } from "./components/DetailPanel";
import { DirectiveTable } from "./components/DirectiveTable";
import { FilterRail } from "./components/FilterRail";

/** Debounce the search box so typing does not fire a query per keystroke. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounced(searchInput);
  const effectiveFilters: Filters = { ...filters, q: debouncedSearch };

  const { data: counts } = useQuery({
    queryKey: ["counts"],
    queryFn: api.counts,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["directives", effectiveFilters],
    queryFn: () => api.directives(effectiveFilters),
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];

  const showToast = useCallback((message: string, ok: boolean) => {
    setToast({ message, ok });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.ok ? 2600 : 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const patch = useCallback((update: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...update }));
  }, []);

  const handleSort = useCallback((key: string) => {
    setFilters((current) => ({
      ...current,
      sort: key,
      order: current.sort === key && current.order === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }, []);

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchInput("");
  }, []);

  // Keyboard triage: j/k to walk rows, Esc to close, / to jump to search.
  // A compliance officer processing a queue should not need the mouse.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLSelectElement;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
        setSelectedId(null);
        return;
      }
      if (typing || rows.length === 0) return;
      if (event.key !== "j" && event.key !== "k") return;

      event.preventDefault();
      const index = rows.findIndex((row) => row.id === selectedId);
      const next =
        event.key === "j"
          ? Math.min(index + 1, rows.length - 1)
          : Math.max(index - 1, 0);
      setSelectedId(rows[index === -1 ? 0 : next].id);
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows, selectedId]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Regulatory Intelligence<span>Triage</span>
        </div>
        <input
          ref={searchRef}
          className="search"
          placeholder="Search title, summary or reference…  (press /)"
          value={searchInput}
          onChange={(event) => {
            setSearchInput(event.target.value);
            patch({ page: 1 });
          }}
        />
        <div className="stats">
          <span>
            <b>{data?.total ?? "–"}</b> directives
          </span>
          <span>
            <b>{counts?.open_action_items ?? "–"}</b> open items
          </span>
          <span>
            <b className="fc-c">{counts?.flagged_directives ?? "–"}</b> flagged
          </span>
        </div>
      </header>

      <div className={selectedId ? "body with-panel" : "body"}>
        <FilterRail
          counts={counts}
          filters={filters}
          onChange={patch}
          onReset={reset}
        />

        <main
          style={{ display: "grid", gridTemplateRows: "minmax(0,1fr) auto", minHeight: 0 }}
        >
          <div className="table-wrap">
            {isError ? (
              <div className="empty">
                Could not load directives.
                <br />
                <span className="flag-field">
                  {(error as Error)?.message ?? "Unknown error"}
                </span>
              </div>
            ) : rows.length === 0 && !isLoading ? (
              <div className="empty">No directives match these filters.</div>
            ) : (
              <DirectiveTable
                rows={rows}
                selectedId={selectedId}
                filters={effectiveFilters}
                onSelect={setSelectedId}
                onSort={handleSort}
              />
            )}
          </div>

          <div className="footer">
            <span>
              Page {data?.page ?? 1} of {data?.pages ?? 1}
            </span>
            <button
              disabled={(data?.page ?? 1) <= 1}
              onClick={() => patch({ page: Math.max(1, (data?.page ?? 1) - 1) })}
            >
              ← Prev
            </button>
            <button
              disabled={(data?.page ?? 1) >= (data?.pages ?? 1)}
              onClick={() => patch({ page: (data?.page ?? 1) + 1 })}
            >
              Next →
            </button>
            <span style={{ marginLeft: "auto" }}>
              <kbd>j</kbd> <kbd>k</kbd> navigate · <kbd>/</kbd> search ·{" "}
              <kbd>esc</kbd> close
            </span>
          </div>
        </main>

        {selectedId !== null && (
          <DetailPanel
            key={selectedId}
            directiveId={selectedId}
            onClose={() => setSelectedId(null)}
            onToast={showToast}
          />
        )}
      </div>

      {toast && (
        <div className={toast.ok ? "toast ok" : "toast"} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
