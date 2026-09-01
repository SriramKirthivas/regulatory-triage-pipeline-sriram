import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { Pill, Tabs, useToast } from "../components/ui";
import { savedViews } from "../lib/savedViews";

/**
 * Settings — configuration and user preferences.
 *
 * Preferences that only affect this browser are stored locally and labelled as
 * such. Anything that would change how records are interpreted (validation
 * thresholds, transition rules) is shown read-only and points at the file that
 * owns it: a compliance system should not let its own rules be edited from a
 * settings screen without an audit trail.
 */

const PREFS_KEY = "artixio.prefs.v1";

interface Prefs {
  operator: string;
  density: "compact" | "comfortable";
  confirmResolve: boolean;
}

const DEFAULTS: Prefs = {
  operator: "compliance.officer",
  density: "compact",
  confirmResolve: false,
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState("preferences");
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { data: counts } = useQuery({ queryKey: ["counts"], queryFn: api.counts });

  // Density is a real preference, not a decorative one — it changes row height.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--row-h",
      prefs.density === "compact" ? "32px" : "44px",
    );
  }, [prefs.density]);

  const save = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Configuration and user preferences" />

      <Tabs
        tabs={[
          { key: "preferences", label: "Preferences" },
          { key: "validation", label: "Validation rules" },
          { key: "workflow", label: "Workflow" },
          { key: "data", label: "Data" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="page">
        {tab === "preferences" && (
          <div className="grid cols-2">
            <div className="card">
              <div className="card-head">
                <h2>Operator</h2>
                <span className="sub">recorded on every status change</span>
              </div>
              <div className="card-body stack">
                <div className="field">
                  <label>Display name</label>
                  <input
                    className="input"
                    value={prefs.operator}
                    onChange={(e) => save({ operator: e.target.value })}
                  />
                  <div className="small faint" style={{ marginTop: 4 }}>
                    Written to the audit trail as <code>changed_by</code>. In production this
                    would come from SSO rather than a text field.
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Interface</h2>
              </div>
              <div className="card-body stack">
                <div className="field">
                  <label>Table density</label>
                  <select
                    className="select"
                    value={prefs.density}
                    onChange={(e) =>
                      save({ density: e.target.value as "compact" | "comfortable" })
                    }
                  >
                    <option value="compact">Compact — 32px rows</option>
                    <option value="comfortable">Comfortable — 44px rows</option>
                  </select>
                </div>
                <label className="row" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={prefs.confirmResolve}
                    onChange={(e) => save({ confirmResolve: e.target.checked })}
                  />
                  <span className="small">Confirm before resolving an action item</span>
                </label>
                <div className="small faint">
                  Stored in this browser only.
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "validation" && (
          <div className="card">
            <div className="card-head">
              <h2>Ingestion rules</h2>
              <span className="sub">
                read-only · defined in <code>api/app/normalize.py</code>
              </span>
            </div>
            <div className="card-body">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>Rule</th>
                    <th style={{ width: 100 }}>Severity</th>
                    <th>Behaviour</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Missing effective date", "CRITICAL", "Store NULL and flag — never invent a compliance deadline"],
                    ["Unparseable date", "CRITICAL", "Store NULL and flag rather than guess at the value"],
                    ["Effective before published", "CRITICAL", "Cross-field check; flag the contradiction"],
                    ["Closed directive, open work", "CRITICAL", "Cross-record check; each row valid, combination is not"],
                    ["Unknown status vocabulary", "WARNING", "Map to UNKNOWN so the record stays visible"],
                    ["Duplicate reference code", "WARNING", "Keep both records and flag the collision"],
                    ["Missing reference code", "WARNING", "Flag — the record cannot be cross-linked"],
                    ["Truncated content", "WARNING", "Flag — upstream never delivered the full text"],
                    ["Malformed text / mojibake", "INFO", "Repair in place and record what was changed"],
                  ].map(([rule, severity, behaviour]) => (
                    <tr key={rule}>
                      <td className="cell-title">{rule}</td>
                      <td>
                        <span className={`pill ${severity.toLowerCase()}`}>
                          <span className="led" />
                          {severity}
                        </span>
                      </td>
                      <td className="muted wrap">{behaviour}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="small faint" style={{ marginTop: 10 }}>
                These are deliberately not editable here. Changing how regulatory data is
                interpreted is a code change that goes through review, not a toggle in a
                settings panel.
              </div>
            </div>
          </div>
        )}

        {tab === "workflow" && (
          <div className="card">
            <div className="card-head">
              <h2>Status transitions</h2>
              <span className="sub">
                read-only · defined in <code>api/app/triage.py</code>
              </span>
            </div>
            <div className="card-body">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 140 }}>From</th>
                    <th>Allowed next states</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Pending", "In Review · Blocked · Resolved · Dismissed"],
                    ["In Review", "Pending · Blocked · Resolved · Dismissed"],
                    ["Blocked", "Pending · In Review · Dismissed"],
                    ["Resolved", "In Review"],
                    ["Dismissed", "Pending"],
                  ].map(([from, to]) => (
                    <tr key={from}>
                      <td className="cell-title">{from}</td>
                      <td className="muted wrap">{to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="small muted" style={{ marginTop: 10 }}>
                A <strong>Blocked</strong> item cannot move straight to Resolved — whatever
                was blocking it has to be cleared first. The API returns <code>409</code>{" "}
                with an explanation rather than silently accepting the move.
              </div>
            </div>
          </div>
        )}

        {tab === "data" && (
          <div className="grid cols-2">
            <div className="card">
              <div className="card-head">
                <h2>Connection</h2>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>API version</dt>
                  <dd className="mono">{health?.version ?? "—"}</dd>
                  <dt>Status</dt>
                  <dd>
                    {health?.status === "ok" ? (
                      <Pill tone="success">Operational</Pill>
                    ) : (
                      <Pill tone="critical">Degraded</Pill>
                    )}
                  </dd>
                  <dt>Database</dt>
                  <dd className="mono">PostgreSQL 16 · {health?.database ?? "—"}</dd>
                  <dt>Directives</dt>
                  <dd className="num">{counts?.total_directives ?? "—"}</dd>
                  <dt>Action items</dt>
                  <dd className="num">{counts?.total_action_items ?? "—"}</dd>
                </dl>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Local data</h2>
              </div>
              <div className="card-body stack">
                <div className="small muted">
                  Saved views and preferences live in this browser's local storage. Clearing
                  them does not touch any regulatory record.
                </div>
                <div className="row">
                  <button
                    className="btn danger sm"
                    onClick={() => {
                      savedViews.list().forEach((v) => savedViews.remove(v.id));
                      toast.success("Saved views cleared");
                    }}
                  >
                    Clear saved views
                  </button>
                  <button
                    className="btn sm"
                    onClick={() => {
                      localStorage.removeItem(PREFS_KEY);
                      setPrefs(DEFAULTS);
                      toast.success("Preferences reset");
                    }}
                  >
                    Reset preferences
                  </button>
                </div>
                <div className="small faint">
                  To reseed the database, run{" "}
                  <code>docker compose exec api python -m app.seed.seed --reset</code>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
