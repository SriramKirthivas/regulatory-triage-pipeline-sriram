import { motion } from "framer-motion";
import type { ActionItem, Flag, WritableStatus } from "../lib/types";
import { Marks, Pill, Priority, Sev, fmtDate } from "./Bits";
import { StatusControl, transitionNote } from "./StatusControl";

interface Props {
  item: ActionItem;
  busy: boolean;
  onStatus: (s: WritableStatus) => void;
  onClose: () => void;
}

function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <div className="muted">No issues detected on this record.</div>;
  return (
    <div className="flag-list">
      {flags.map((f, i) => (
        <motion.div
          key={`${f.code}-${f.field}-${i}`}
          className={`flag ${f.level}`}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03, duration: 0.18 }}
        >
          <div>
            <div className="head">
              <b>{f.message}</b>
              <span className="code">
                {f.field} {f.code}
              </span>
            </div>
            {f.raw != null && (
              <div className="raw">
                <span>raw</span>
                {JSON.stringify(f.raw)}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function DetailPanel({ item, busy, onStatus, onClose }: Props) {
  const d = item.directive;
  const note = transitionNote(item.status);
  return (
    <motion.aside
      className="panel"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      aria-label="Action item detail"
    >
      <div className="panel-head">
        <h2>
          <span className="cell-id">#{item.id}</span>
          {item.title ?? <span className="muted">No usable title</span>}
        </h2>
        <button className="close" onClick={onClose} aria-label="Close panel" title="Esc">
          <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div className="panel-section">
        <StatusControl value={item.status} busy={busy} onChange={onStatus} />
        {note && <div className="transition-note">{note}</div>}
      </div>

      <div className="panel-section">
        <h3>Action item</h3>
        <dl className="kv">
          <dt>Status</dt>
          <dd>
            <Pill status={item.status} />
            {item.status_raw !== item.status && <span className="cell-sub">stored as {JSON.stringify(item.status_raw)}</span>}
          </dd>
          <dt>Priority</dt>
          <dd>
            <Priority value={item.priority} /> <span className="cell-sub">{item.priority} of 5</span>
          </dd>
          <dt>Owner</dt>
          <dd>{item.owner ?? <span className="muted">unassigned</span>}</dd>
          <dt>Due</dt>
          <dd className={item.flags.some((f) => f.field === "due_date" && f.level === "error") ? "err" : ""}>
            {item.due_date ? fmtDate(item.due_date) : <span className="muted">none</span>}
          </dd>
          <dt>Updated</dt>
          <dd className="num">{new Date(item.updated_at).toLocaleString()}</dd>
        </dl>
      </div>

      <div className="panel-section">
        <h3>Issues on this item</h3>
        <FlagList flags={item.flags} />
      </div>

      <div className="panel-section">
        <h3>Directive</h3>
        <dl className="kv">
          <dt>Reference</dt>
          <dd>
            <span className="ref">{d.reference_code}</span>
            {d.duplicate_of && <span className="cell-sub">duplicate of #{d.duplicate_of}</span>}
          </dd>
          <dt>Title</dt>
          <dd>{d.title ?? <span className="muted">No usable title</span>}</dd>
          <dt>Authority</dt>
          <dd>
            {d.authority.acronym} <span className="cell-sub">{d.authority.name}</span>
          </dd>
          <dt>Category</dt>
          <dd>{d.category}</dd>
          <dt>Severity</dt>
          <dd>
            <Sev value={d.severity} />
          </dd>
          <dt>Status</dt>
          <dd className={d.status === "unknown" ? "err" : ""}>{d.status.replace(/_/g, " ")}</dd>
          <dt>Published</dt>
          <dd className={!d.published_at ? "err" : ""}>{d.published_at ? fmtDate(d.published_at) : "missing"}</dd>
          <dt>Effective</dt>
          <dd className={!d.effective_date ? "err" : ""}>{d.effective_date ? fmtDate(d.effective_date) : "missing"}</dd>
          <dt>Comments by</dt>
          <dd>{d.comment_deadline ? fmtDate(d.comment_deadline) : <span className="muted">n/a</span>}</dd>
        </dl>
      </div>

      <div className="panel-section">
        <h3>Issues on the directive</h3>
        <FlagList flags={d.flags} />
        {d.flags.length > 0 && (
          <div className="transition-note">
            In the table: <Marks flags={d.flags} />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
