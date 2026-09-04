import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Marks, Pill, Priority, Sev, dueClass, fmtDate } from "../components/Bits";
import { Btn, Footer, PageFade } from "../components/Site";
import { StatusControl } from "../components/StatusControl";
import { ToastProvider, useToast } from "../components/Toast";
import { ApiError, api } from "../lib/api";
import type { DirectiveOut, Flag, WritableStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";

function Flags({ flags }: { flags: Flag[] }) {
  if (!flags.length) return <div className="muted">No issues detected.</div>;
  return (
    <div className="flag-list">
      {flags.map((f, i) => (
        <div key={i} className={`flag ${f.level}`}>
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
        </div>
      ))}
    </div>
  );
}

function Detail() {
  const { id } = useParams();
  const did = Number(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const d = useQuery({ queryKey: ["directive", did], queryFn: () => api.directive(did), enabled: Number.isFinite(did) });

  const mut = useMutation({
    mutationFn: ({ itemId, status }: { itemId: number; status: WritableStatus }) => api.setStatus(itemId, status),
    onMutate: ({ itemId }) => setBusyId(itemId),
    onSuccess: (item) => {
      qc.setQueryData<DirectiveOut>(["directive", did], (p) =>
        p ? { ...p, action_items: p.action_items.map((a) => (a.id === item.id ? { ...a, status: item.status, flags: item.flags, has_errors: item.has_errors } : a)) } : p,
      );
      qc.invalidateQueries({ queryKey: ["anomalies"] });
      qc.invalidateQueries({ queryKey: ["directives"] });
      toast({ tone: "ok", text: `Marked ${STATUS_LABEL[item.status].toLowerCase()}`, code: `#${item.id}` });
    },
    onError: (e, v) => toast({ tone: "error", text: e instanceof ApiError ? e.userMessage : "Update failed", code: `#${v.itemId}` }),
    onSettled: () => setBusyId(null),
  });

  if (d.isLoading) return <div className="wrap" style={{ padding: 48 }}><div className="skeleton" /></div>;
  if (d.isError || !d.data)
    return (
      <div className="wrap empty">
        <b>Directive not found</b>
        <Link to="/directives">Back to all directives</Link>
      </div>
    );
  const x = d.data;
  const open = x.action_items.filter((a) => a.status !== "resolved").length;

  return (
    <PageFade>
      <section className="detail-hero">
        <div className="wrap">
          <div className="crumbs">
            <Link to="/directives">Directives</Link>
            <span>/</span>
            <span>{x.authority.acronym}</span>
          </div>
          <div className="ref">{x.reference_code}</div>
          <h1>{x.title ?? <span style={{ opacity: 0.6 }}>No usable title</span>}</h1>
          <div className="facts">
            <span>Authority <b>{x.authority.name}</b></span>
            <span>Category <b>{x.category}</b></span>
            <span>Severity <b>{x.severity}</b></span>
            <span className={x.status === "unknown" ? "err" : ""}>Status <b>{x.status.replace(/_/g, " ")}</b></span>
            <span className={x.published_at ? "" : "err"}>Published <b>{x.published_at ? fmtDate(x.published_at) : "missing"}</b></span>
            <span className={x.effective_date ? "" : "err"}>Effective <b>{x.effective_date ? fmtDate(x.effective_date) : "missing"}</b></span>
            <span>Open items <b>{open} of {x.action_items.length}</b></span>
          </div>
        </div>
      </section>

      <div className="wrap detail-grid">
        <div style={{ display: "grid", gap: 24, alignContent: "start" }}>
          {x.summary && (
            <div className="block">
              <h3>Summary</h3>
              <div className="summary-text">{x.summary}</div>
            </div>
          )}
          <div className="block">
            <h3>Action items</h3>
            {x.action_items.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                <b>No action items yet</b>
                This directive was seeded without any work attached to it, which is itself worth a look.
              </div>
            )}
            <div className="item-list">
              {x.action_items.map((a) => (
                <div key={a.id} className="item-row">
                  <Priority value={a.priority} />
                  <div>
                    <div className="t">
                      <span className="cell-id" style={{ marginRight: 8 }}>#{a.id}</span>
                      {a.title ?? <span className="muted">No usable title</span>}
                    </div>
                    <div className="s">
                      <Pill status={a.status} />
                      <span>{a.owner ?? "unassigned"}</span>
                      <span className={dueClass(a.due_date, a.status)}>{a.due_date ? `Due ${fmtDate(a.due_date)}` : "No due date"}</span>
                      <Marks flags={a.flags} />
                    </div>
                  </div>
                  <div className="ctl">
                    <StatusControl value={a.status} busy={busyId === a.id} onChange={(s) => mut.mutate({ itemId: a.id, status: s })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 24, alignContent: "start" }}>
          <div className="block">
            <h3>Issues on this directive</h3>
            <Flags flags={x.flags} />
            {x.duplicate_of && (
              <div className="transition-note">
                Shares its reference code with <Link to={`/directives/${x.duplicate_of}`}>directive #{x.duplicate_of}</Link>.
              </div>
            )}
          </div>
          <div className="block">
            <h3>At a glance</h3>
            <dl className="kv">
              <dt>Severity</dt>
              <dd><Sev value={x.severity} /></dd>
              <dt>Comments by</dt>
              <dd>{x.comment_deadline ? fmtDate(x.comment_deadline) : <span className="muted">n/a</span>}</dd>
              <dt>Jurisdiction</dt>
              <dd>{x.authority.jurisdiction}, {x.authority.region}</dd>
              <dt>Flags in table</dt>
              <dd>{x.flags.length ? <Marks flags={x.flags} /> : <span className="muted">none</span>}</dd>
            </dl>
          </div>
          <Btn to={`/triage`} tone="navy">Open the full queue</Btn>
        </div>
      </div>
      <Footer />
    </PageFade>
  );
}

export default function DirectiveDetail() {
  return (
    <ToastProvider>
      <Detail />
    </ToastProvider>
  );
}
