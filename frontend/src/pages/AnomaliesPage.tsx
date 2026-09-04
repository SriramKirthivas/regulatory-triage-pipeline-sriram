import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Btn, Footer, PageFade } from "../components/Site";
import { api } from "../lib/api";

const RULES: Record<string, { level: "warn" | "error"; text: string }> = {
  code_normalised: { level: "warn", text: "A status or severity code was a known alias or typo (RESOLVD, In-Progress, closed) and was mapped to the canonical value. The raw code is kept." },
  unknown_code: { level: "error", text: "A code matched nothing in the alias table (IN_LIMBO, ACTIVE??, sev1). The row is quarantined as unknown until a person picks the real value." },
  missing_date: { level: "error", text: "A publication or effective date is null. The app never invents a date; it shows the gap so the compliance window is planned on purpose." },
  date_conflict: { level: "error", text: "Dates contradict each other: effective before published, or a comment deadline before publication." },
  implausible_date: { level: "warn", text: "A date is technically valid but almost certainly wrong, such as a 1970 epoch default or a due date in 2099." },
  html_stripped: { level: "warn", text: "Markup found in free text was removed before it reached the UI. Script tags included." },
  control_chars: { level: "warn", text: "Non-printing control characters were removed from text." },
  bad_encoding: { level: "warn", text: "Replacement characters from a failed encoding round-trip were removed." },
  whitespace: { level: "warn", text: "Leading, trailing or repeated whitespace was collapsed." },
  placeholder_text: { level: "error", text: "A required field held a placeholder (N/A, TBD, null, blank). It is treated as missing." },
  priority_out_of_range: { level: "warn", text: "Priority fell outside 1 to 5 and was clamped to the nearest bound." },
  missing_priority: { level: "warn", text: "Priority was null and defaulted to 3." },
  overdue: { level: "warn", text: "An open item is past its due date, computed against today." },
  duplicate_reference: { level: "error", text: "Two directives share a reference code once case and whitespace are normalised. The duplicate is linked to its owner." },
  code_format: { level: "warn", text: "A reference code was stored with the wrong case or stray whitespace and was normalised for display." },
  status_conflict: { level: "error", text: "A withdrawn directive still has open action items. Cross-entity checks like this need a person to decide." },
  missing_status: { level: "error", text: "Status was null and the row was quarantined." },
  missing_required: { level: "error", text: "A required text field was null." },
};

export default function AnomaliesPage() {
  const s = useQuery({ queryKey: ["anomalies"], queryFn: api.anomalies });
  const entries = Object.entries(s.data?.by_code ?? {});
  const max = entries[0]?.[1] ?? 1;
  const errors = entries.filter(([c]) => RULES[c]?.level === "error");
  const warns = entries.filter(([c]) => RULES[c]?.level !== "error");

  const group = (title: string, note: string, list: [string, number][]) => (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <h2>{title}</h2>
            <p>{note}</p>
          </div>
        </div>
        <div className="rules">
          {list.map(([code, n]) => {
            const r = RULES[code] ?? { level: "warn" as const, text: "" };
            return (
              <div key={code} className={`rule ${r.level}`}>
                <div className="code">
                  <b>{code}</b>
                  <span className="n">{n}</span>
                </div>
                <span className={`lvl ${r.level}`}>{r.level === "error" ? "Needs a decision" : "Repaired and logged"}</span>
                <div className="bar">
                  <motion.i initial={{ scaleX: 0 }} whileInView={{ scaleX: n / max }} viewport={{ once: true }} transition={{ duration: 0.6, ease: "easeOut" }} />
                </div>
                <p>{r.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );

  return (
    <PageFade>
      <section className="detail-hero">
        <div className="wrap">
          <h1>Data quality, in the open</h1>
          <div className="facts">
            <span>Rows checked <b>{(s.data?.total_items ?? 0) + (s.data?.total_directives ?? 0)}</b></span>
            <span className="err">Need a decision <b>{s.data?.items_with_errors ?? 0}</b></span>
            <span>Repaired automatically <b>{s.data?.items_with_warnings ?? 0}</b></span>
            <span>Rule types fired <b>{entries.length}</b></span>
          </div>
          <div style={{ marginTop: 22 }}>
            <Btn to="/triage?errors=1" tone="amber">Review the errors</Btn>
          </div>
        </div>
      </section>
      {group("Errors", "The pipeline could not fix these safely. Each one is shown to the officer with the raw stored value.", errors)}
      <div style={{ borderTop: "1px solid var(--line)" }} />
      {group("Warnings", "Fixed automatically on read. The original value is kept on the flag so nothing is silently rewritten.", warns)}
      <Footer />
    </PageFade>
  );
}
