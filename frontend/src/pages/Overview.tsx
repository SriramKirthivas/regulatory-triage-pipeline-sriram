import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Marks, Sev, fmtDate } from "../components/Bits";
import { Btn, Footer, PageFade } from "../components/Site";
import { api } from "../lib/api";
import { STATUS_LABEL, type ItemStatus } from "../lib/types";

const ORDER: ItemStatus[] = ["pending", "in_progress", "blocked", "resolved", "unknown"];
const COLOR: Record<ItemStatus, string> = {
  pending: "#c9d2e0",
  in_progress: "#8fc1ff",
  blocked: "#b39bff",
  resolved: "#5fd39a",
  unknown: "#f2b64c",
};

function Headline({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <h1 aria-label={text}>
      {words.map((w, i) => (
        <span className="w" key={i} aria-hidden="true">
          <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ delay: 0.08 + i * 0.06, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
            {w}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

export default function Overview() {
  const s = useQuery({ queryKey: ["anomalies"], queryFn: api.anomalies });
  const auths = useQuery({ queryKey: ["authorities"], queryFn: api.authorities, staleTime: Infinity });
  const dirs = useQuery({ queryKey: ["directives", "all"], queryFn: () => api.directives() });

  const latest = [...(dirs.data ?? [])]
    .filter((d) => d.published_at)
    .sort((a, b) => (b.published_at! > a.published_at! ? 1 : -1))
    .slice(0, 6);
  const total = s.data?.total_items ?? 0;
  const codes = Object.entries(s.data?.by_code ?? {}).slice(0, 6);

  return (
    <PageFade>
      <section className="hero">
        <div className="wrap">
          <div>
            <Headline text="Directives checked. Action items ranked." />
            <motion.p className="lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.5 }}>
              Directives from eight regulators arrive with typo status codes, missing dates and markup in titles. The pipeline repairs what it safely can, quarantines what it cannot, and hands your compliance officer a ranked list with every fault visible.
            </motion.p>
            <motion.div className="cta" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }}>
              <Btn to="/triage" tone="amber">Start triaging</Btn>
              <Btn to="/anomalies" tone="ghost">See what was caught</Btn>
            </motion.div>
          </div>
          <motion.div className="hero-stats" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6 }}>
            <div className="stat">
              <div className="v">{s.data?.total_directives ?? "–"}</div>
              <div className="l">directives from {auths.data?.length ?? 8} regulators</div>
            </div>
            <div className="stat">
              <div className="v">{total || "–"}</div>
              <div className="l">action items in the queue</div>
            </div>
            <div className="stat">
              <div className="v hot">{s.data?.items_with_errors ?? "–"}</div>
              <div className="l">need a human decision</div>
            </div>
            <div className="stat">
              <div className="v">{s.data?.items_with_warnings ?? "–"}</div>
              <div className="l">repaired automatically</div>
            </div>
            {s.data && (
              <div className="stat wide">
                <div className="bar">
                  {ORDER.map((k) => (
                    <motion.i key={k} style={{ background: COLOR[k] }} initial={{ width: 0 }} animate={{ width: `${((s.data.by_status[k] ?? 0) / total) * 100}%` }} transition={{ delay: 0.9, duration: 0.8, ease: "easeOut" }} />
                  ))}
                </div>
                <div className="legend">
                  {ORDER.map((k) => (
                    <span key={k}>
                      <i style={{ background: COLOR[k] }} />
                      {STATUS_LABEL[k]} {s.data.by_status[k] ?? 0}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {auths.data && (
        <div className="strip" aria-label="Regulators covered">
          <div className="track">
            {[...auths.data, ...auths.data].map((a, i) => (
              <span className="reg" key={i}>
                <b>{a.acronym}</b>
                <span>{a.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>Latest directives</h2>
              <p>Newest publications first. A red bar means the backend found something on the directive that needs a person, not a script.</p>
            </div>
            <Btn to="/directives" tone="navy" sm>All directives</Btn>
          </div>
          <div className="cards">
            {dirs.isLoading && [1, 2, 3].map((n) => <div key={n} className="skeleton" />)}
            {latest.map((d) => (
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
                  <span>Published {fmtDate(d.published_at)}</span>
                  <span className={d.effective_date ? "" : "err"}>{d.effective_date ? `Effective ${fmtDate(d.effective_date)}` : "Effective date missing"}</span>
                </div>
                <div className="foot">
                  <Marks flags={d.flags} />
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
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>What the pipeline caught this run</h2>
              <p>Every row is checked on read. Warnings were repaired and logged; errors are shown to the officer with the raw value so the fix is a decision, not a guess.</p>
            </div>
            <Btn to="/anomalies" tone="navy" sm>Full breakdown</Btn>
          </div>
          <div className="rules">
            {codes.map(([code, n]) => (
              <div key={code} className="rule">
                <div className="code">
                  <b>{code}</b>
                  <span className="n">{n}</span>
                </div>
                <div className="bar">
                  <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: n / (codes[0]?.[1] ?? 1) }} viewport={{ once: true }} transition={{ duration: 0.7, ease: "easeOut" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </PageFade>
  );
}
