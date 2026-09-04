import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Marks, Sev, fmtDate } from "../components/Bits";
import { Footer, PageFade } from "../components/Site";
import { api } from "../lib/api";

export default function DirectivesPage() {
  const [authority, setAuthority] = useState<number | null>(null);
  const [only, setOnly] = useState<"all" | "flagged" | "clean">("all");
  const [q, setQ] = useState("");
  const auths = useQuery({ queryKey: ["authorities"], queryFn: api.authorities, staleTime: Infinity });
  const dirs = useQuery({ queryKey: ["directives", "all"], queryFn: () => api.directives() });

  const rows = useMemo(() => {
    let r = dirs.data ?? [];
    if (authority != null) r = r.filter((d) => d.authority.id === authority);
    if (only === "flagged") r = r.filter((d) => d.flags.length);
    if (only === "clean") r = r.filter((d) => !d.flags.length);
    if (q) {
      const k = q.toLowerCase();
      r = r.filter((d) => (d.title ?? "").toLowerCase().includes(k) || d.reference_code.toLowerCase().includes(k));
    }
    return r;
  }, [dirs.data, authority, only, q]);

  return (
    <PageFade>
      <section className="section" style={{ paddingTop: 48 }}>
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Directives</h2>
              <p>{dirs.data?.length ?? 0} published updates. Open one to see its action items and change their status in place.</p>
            </div>
          </div>
          <div className="toolbar">
            <label className="search" style={{ minWidth: 300 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or reference" />
            </label>
            <select className="select" value={authority ?? ""} onChange={(e) => setAuthority(e.target.value ? Number(e.target.value) : null)}>
              <option value="">All authorities</option>
              {auths.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.acronym} ({a.jurisdiction})
                </option>
              ))}
            </select>
            <div className="chipset">
              {(["all", "flagged", "clean"] as const).map((k) => (
                <button key={k} className={`chip${only === k ? " on" : ""}${k === "flagged" ? " tone-warn" : ""}`} onClick={() => setOnly(k)}>
                  {k === "all" ? "All" : k === "flagged" ? "Flagged" : "Clean"}
                </button>
              ))}
            </div>
            <span className="result-count">{rows.length} shown</span>
          </div>

          <div className="cards">
            {dirs.isLoading && [1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="skeleton" />)}
            {rows.map((d) => (
              <Link key={d.id} to={`/directives/${d.id}`} className={`card${d.has_errors ? " fault" : ""}`}>
                <div className="top">
                  <span className="auth">
                    {d.authority.acronym}
                    <small>{d.category}</small>
                  </span>
                  <Sev value={d.severity} />
                </div>
                <h3>{d.title ?? <span className="muted">No usable title</span>}</h3>
                <div className="meta">
                  <span className="ref">{d.reference_code}</span>
                  <span>{d.status.replace(/_/g, " ")}</span>
                  <span className={d.published_at ? "" : "err"}>{d.published_at ? `Published ${fmtDate(d.published_at)}` : "No publication date"}</span>
                  <span className={d.effective_date ? "" : "err"}>{d.effective_date ? `Effective ${fmtDate(d.effective_date)}` : "No effective date"}</span>
                </div>
                <div className="foot">
                  {d.flags.length ? <Marks flags={d.flags} /> : <span className="muted">No issues</span>}
                  <span className="go">
                    Open
                    <i>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6h10M6.5 1.5L11 6l-4.5 4.5" />
                      </svg>
                    </i>
                  </span>
                </div>
              </Link>
            ))}
            {!dirs.isLoading && !rows.length && (
              <div className="empty" style={{ gridColumn: "1 / -1" }}>
                <b>No directives match</b>
                Try another authority or clear the search.
              </div>
            )}
          </div>
        </div>
      </section>
      <Footer />
    </PageFade>
  );
}
