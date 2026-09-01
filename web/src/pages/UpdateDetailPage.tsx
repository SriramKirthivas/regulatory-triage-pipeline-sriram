import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ACTION_STATUSES,
  api,
  ApiError,
  FLAG_ISSUES,
  PRIORITIES,
  type ActionItem,
  type ActionItemStatus,
  type DirectiveDetail,
  type Flag,
  type FlagIssue,
  type FlagSeverity,
  type Priority,
} from "../api";
import { PageHeader } from "../components/PageHeader";
import {
  ActionStatusPill,
  DirectiveStatusPill,
  EmptyState,
  Field,
  Icons,
  Modal,
  Owner,
  Pill,
  SeverityPill,
  Tabs,
  TriageStatusPill,
  useToast,
} from "../components/ui";
import { formatDateTime, label, relativeDays } from "../lib/format";

/**
 * Single-record triage screen.
 *
 * Every mutation here is optimistic and rolls back on refusal, so an illegal
 * workflow transition surfaces the server's reason rather than a generic failure.
 */

export function UpdateDetailPage() {
  const { id } = useParams();
  const directiveId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("overview");
  const [createOpen, setCreateOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["directive", directiveId],
    queryFn: () => api.directive(directiveId),
    enabled: Number.isFinite(directiveId),
  });

  const { data: neighbours } = useQuery({
    queryKey: ["neighbours", directiveId],
    queryFn: () => api.neighbours(directiveId),
    enabled: Number.isFinite(directiveId),
  });

  const { data: owners } = useQuery({ queryKey: ["owners"], queryFn: api.owners });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["directive", directiveId] });
    queryClient.invalidateQueries({ queryKey: ["directives"] });
    queryClient.invalidateQueries({ queryKey: ["counts"] });
    queryClient.invalidateQueries({ queryKey: ["actionItems"] });
    queryClient.invalidateQueries({ queryKey: ["flags"] });
  };

  const updateItem = useMutation({
    mutationFn: ({
      itemId,
      patch,
    }: {
      itemId: number;
      patch: Parameters<typeof api.updateActionItem>[1];
    }) => api.updateActionItem(itemId, patch),

    onMutate: async ({ itemId, patch }) => {
      await queryClient.cancelQueries({ queryKey: ["directive", directiveId] });
      const previous = queryClient.getQueryData<DirectiveDetail>(["directive", directiveId]);
      if (previous) {
        queryClient.setQueryData<DirectiveDetail>(["directive", directiveId], {
          ...previous,
          action_items: previous.action_items.map((item) =>
            item.id === itemId ? { ...item, ...patch } : item,
          ),
        });
      }
      return { previous };
    },

    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["directive", directiveId], context.previous);
      }
      toast.error(
        error instanceof ApiError && error.status === 409
          ? "Transition refused"
          : "Update failed",
        error instanceof ApiError ? error.message : "Could not reach the server.",
      );
    },

    onSuccess: (item) => {
      toast.success("Action item updated", `${item.title.slice(0, 60)} → ${label(item.status)}`);
    },

    onSettled: invalidate,
  });

  const createItem = useMutation({
    mutationFn: (body: Parameters<typeof api.createActionItem>[1]) =>
      api.createActionItem(directiveId, body),
    onSuccess: (item) => {
      setCreateOpen(false);
      toast.success("Action item created", item.title);
      invalidate();
    },
    onError: (error) => {
      toast.error(
        "Could not create action item",
        error instanceof ApiError ? error.message : "Unknown error.",
      );
    },
  });

  const createFlag = useMutation({
    mutationFn: (body: Parameters<typeof api.createFlag>[1]) =>
      api.createFlag(directiveId, body),
    onSuccess: () => {
      setFlagOpen(false);
      toast.success("Record flagged", "Raised as a manual data-quality issue.");
      invalidate();
    },
    onError: (error) => {
      toast.error(
        "Could not flag record",
        error instanceof ApiError ? error.message : "Unknown error.",
      );
    },
  });

  const revalidate = useMutation({
    mutationFn: () => api.revalidate(directiveId),
    onSuccess: (result) => {
      toast.success("Validation re-run", result.message);
      invalidate();
    },
    onError: (error) => {
      toast.error(
        "Validation failed",
        error instanceof ApiError ? error.message : "Unknown error.",
      );
    },
  });

  const resolveFlag = useMutation({
    mutationFn: (flagId: number) => api.resolveFlag(flagId),
    onSuccess: () => {
      toast.success("Issue acknowledged", "The flag is closed but kept on the record.");
      invalidate();
    },
    onError: (error) => {
      toast.error(
        "Could not acknowledge",
        error instanceof ApiError ? error.message : "Unknown error.",
      );
    },
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Not found" breadcrumb={[{ label: "Updates", to: "/updates" }]} />
        <div className="page">
          <EmptyState
            title="That record does not exist"
            body="It may have been removed, or the link is wrong."
          />
        </div>
      </>
    );
  }

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Loading…" breadcrumb={[{ label: "Updates", to: "/updates" }]} />
        <div className="page">
          <div className="card">
            <div className="card-body stack">
              <div className="skeleton" style={{ width: "50%" }} />
              <div className="skeleton" style={{ width: "80%" }} />
              <div className="skeleton" style={{ width: "65%" }} />
            </div>
          </div>
        </div>
      </>
    );
  }

  const openFlags = data.flags.filter((f) => f.resolved_at === null);
  const directiveFlags = data.flags.filter((f) => f.action_item_id === null);

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Updates", to: "/updates" },
          { label: data.reference_code ?? "Untitled record" },
        ]}
        title={data.title}
        subtitle={`${data.authority.name} · ${data.authority.jurisdiction}`}
        actions={
          <>
            <button className="btn" onClick={() => navigate("/updates")}>
              <Icons.back /> Back to queue
            </button>
            <button
              className="btn"
              disabled={!neighbours?.previous_id}
              onClick={() => navigate(`/updates/${neighbours?.previous_id}`)}
            >
              <Icons.prev /> Previous
            </button>
            <button
              className="btn"
              disabled={!neighbours?.next_id}
              onClick={() => navigate(`/updates/${neighbours?.next_id}`)}
            >
              Next <Icons.next />
            </button>
            {neighbours && (
              <span className="small faint">
                {neighbours.position} of {neighbours.total}
              </span>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { key: "overview", label: "Overview" },
          { key: "items", label: "Action Items", count: data.action_items.length },
          { key: "quality", label: "Data Quality", count: openFlags.length },
          { key: "source", label: "Source Record" },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="page">
        <div className="row wrap-row" style={{ marginBottom: 12 }}>
          <button className="btn primary" onClick={() => setCreateOpen(true)}>
            <Icons.plus /> Create action item
          </button>
          <button className="btn" onClick={() => setFlagOpen(true)}>
            <Icons.flag /> Flag record
          </button>
          <button
            className="btn"
            disabled={revalidate.isPending}
            onClick={() => revalidate.mutate()}
          >
            <Icons.shield /> {revalidate.isPending ? "Validating…" : "Validate data"}
          </button>
        </div>

        {tab === "overview" && (
          <div className="grid cols-2">
            <div className="card">
              <div className="card-head">
                <h2>Record</h2>
                <span className="toolbar-spacer" />
                <DirectiveStatusPill status={data.status} />
                <TriageStatusPill status={data.triage_status} />
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Reference</dt>
                  <dd className="mono">
                    {data.reference_code ?? <span className="missing">none supplied</span>}
                  </dd>
                  <dt>Authority</dt>
                  <dd>
                    {data.authority.code} — {data.authority.name}
                  </dd>
                  <dt>Published</dt>
                  <dd className="mono">
                    {data.published_date ?? <span className="missing">missing</span>}
                  </dd>
                  <dt>Effective</dt>
                  <dd className="mono">
                    {data.effective_date ?? <span className="missing">missing</span>}
                  </dd>
                  <dt>Next due</dt>
                  <dd className="mono">
                    {data.next_due_date ? (
                      <span className={data.overdue ? "overdue" : ""}>
                        {data.next_due_date} · {relativeDays(data.next_due_date)}
                      </span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </dd>
                  <dt>Document type</dt>
                  <dd>{data.document_type ?? "—"}</dd>
                  <dt>Therapeutic area</dt>
                  <dd>{data.therapeutic_area ?? "—"}</dd>
                  <dt>Owner</dt>
                  <dd>
                    <Owner name={data.primary_owner} />
                    {data.owner_count > 1 && (
                      <span className="small faint"> +{data.owner_count - 1} more</span>
                    )}
                  </dd>
                  <dt>Source</dt>
                  <dd>
                    {data.source_url ? (
                      <a href={data.source_url} target="_blank" rel="noreferrer">
                        {data.source_url.replace(/^https?:\/\//, "").slice(0, 44)}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt>Ingested</dt>
                  <dd className="mono small">{formatDateTime(data.ingested_at)}</dd>
                </dl>
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <div className="card-head">
                  <h2>Summary</h2>
                </div>
                <div className="card-body">
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                    {data.summary ?? (
                      <span className="faint">No summary was supplied by the source.</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid cols-3">
                <div className="stat">
                  <div className="label">Open items</div>
                  <div className="value brand">{data.open_item_count}</div>
                  <div className="foot">of {data.action_items.length} total</div>
                </div>
                <div className="stat">
                  <div className="label">Open issues</div>
                  <div className={openFlags.length ? "value critical" : "value"}>
                    {openFlags.length}
                  </div>
                  <div className="foot">{data.flag_summary.total} detected</div>
                </div>
                <div className="stat">
                  <div className="label">Severity</div>
                  <div className="value" style={{ fontSize: 15, paddingTop: 4 }}>
                    {data.flag_summary.max_severity ? (
                      <SeverityPill severity={data.flag_summary.max_severity} />
                    ) : (
                      <Pill tone="success">Clean</Pill>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "items" && (
          <div className="card">
            <div className="card-head">
              <h2>Action Items</h2>
              <span className="sub">
                {data.open_item_count} open of {data.action_items.length}
              </span>
            </div>
            <div className="card-body">
              {data.action_items.length === 0 ? (
                <EmptyState
                  title="No action items yet"
                  body="Create one to start tracking work against this directive."
                />
              ) : (
                data.action_items.map((item) => (
                  <ActionItemCard
                    key={item.id}
                    item={item}
                    flags={data.flags.filter((f) => f.action_item_id === item.id)}
                    owners={owners ?? []}
                    busy={updateItem.isPending && updateItem.variables?.itemId === item.id}
                    onPatch={(patch) => updateItem.mutate({ itemId: item.id, patch })}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {tab === "quality" && (
          <div className="card">
            <div className="card-head">
              <h2>Data Quality</h2>
              <span className="sub">
                Caught on ingest by the validation pipeline · {openFlags.length} unresolved
              </span>
            </div>
            <div className="card-body">
              {data.flags.length === 0 ? (
                <EmptyState
                  title="No issues detected"
                  body="Every field on this record parsed and validated cleanly."
                />
              ) : (
                <>
                  {directiveFlags.map((flag) => (
                    <FlagCard
                      key={flag.id}
                      flag={flag}
                      onResolve={() => resolveFlag.mutate(flag.id)}
                      busy={resolveFlag.isPending}
                    />
                  ))}
                  {data.flags
                    .filter((f) => f.action_item_id !== null)
                    .map((flag) => (
                      <FlagCard
                        key={flag.id}
                        flag={flag}
                        context={
                          data.action_items.find((i) => i.id === flag.action_item_id)?.title
                        }
                        onResolve={() => resolveFlag.mutate(flag.id)}
                        busy={resolveFlag.isPending}
                      />
                    ))}
                </>
              )}
            </div>
          </div>
        )}

        {tab === "source" && (
          <div className="card">
            <div className="card-head">
              <h2>Source record as received</h2>
              <span className="sub">
                Stored verbatim on ingest — every cleaned field traces back to this
              </span>
            </div>
            <div className="card-body">
              <div className="raw" style={{ maxHeight: 460, overflow: "auto" }}>
                {JSON.stringify(data.raw_payload, null, 2)}
              </div>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateItemModal
          owners={owners ?? []}
          busy={createItem.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(body) => createItem.mutate(body)}
        />
      )}

      {flagOpen && (
        <FlagModal
          items={data.action_items}
          busy={createFlag.isPending}
          onClose={() => setFlagOpen(false)}
          onSubmit={(body) => createFlag.mutate(body)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function ActionItemCard({
  item,
  flags,
  owners,
  busy,
  onPatch,
}: {
  item: ActionItem;
  flags: Flag[];
  owners: string[];
  busy: boolean;
  onPatch: (patch: {
    status?: ActionItemStatus;
    owner?: string | null;
    priority?: Priority;
  }) => void;
}) {
  const done = item.status === "RESOLVED" || item.status === "DISMISSED";
  const overdue = !!item.due_date && !done && new Date(item.due_date) < new Date();

  return (
    <div className={done ? "itemrow done" : "itemrow"}>
      <div className="itemrow-title">{item.title}</div>
      {item.description && (
        <div className="small muted" style={{ marginTop: 3 }}>
          {item.description}
        </div>
      )}

      <div className="itemrow-meta">
        <ActionStatusPill status={item.status} />
        <span className={`prio-${item.priority}`}>{label(item.priority)}</span>
        <span>·</span>
        <Owner name={item.owner} />
        <span>·</span>
        <span className={overdue ? "overdue" : ""}>
          {item.due_date ? `due ${item.due_date}` : "no due date"}
          {item.due_date && ` · ${relativeDays(item.due_date)}`}
        </span>
      </div>

      {flags.map((flag) => (
        <div key={flag.id} style={{ marginTop: 7 }}>
          <FlagCard flag={flag} compact />
        </div>
      ))}

      <div className="itemrow-controls">
        {/* Every status is offered, including illegal ones: the server is the
            single authority on legal transitions and explains its refusals. */}
        <select
          className="select"
          value={item.status}
          disabled={busy}
          onChange={(e) => onPatch({ status: e.target.value as ActionItemStatus })}
        >
          {ACTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {label(status)}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={item.owner ?? ""}
          disabled={busy}
          onChange={(e) => onPatch({ owner: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>

        <select
          className="select"
          value={item.priority}
          disabled={busy}
          onChange={(e) => onPatch({ priority: e.target.value as Priority })}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {label(priority)}
            </option>
          ))}
        </select>

        {!done && (
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={() => onPatch({ status: "RESOLVED" })}
          >
            <Icons.check /> Resolve
          </button>
        )}
        {busy && <span className="small faint">saving…</span>}
      </div>
    </div>
  );
}

function FlagCard({
  flag,
  context,
  compact = false,
  onResolve,
  busy,
}: {
  flag: Flag;
  context?: string;
  compact?: boolean;
  onResolve?: () => void;
  busy?: boolean;
}) {
  const resolved = flag.resolved_at !== null;
  return (
    <div className={`flagbox ${flag.severity}${resolved ? " resolved" : ""}`}>
      <div className="flagbox-head">
        <span className="flagbox-issue">{flag.issue}</span>
        <span className="flagbox-field">{flag.field}</span>
        {flag.source === "MANUAL" && <Pill tone="brand">Manual</Pill>}
        {resolved && <Pill tone="neutral">Acknowledged</Pill>}
        {!compact && !resolved && onResolve && (
          <>
            <span className="toolbar-spacer" />
            <button className="btn sm" disabled={busy} onClick={onResolve}>
              <Icons.check /> Acknowledge
            </button>
          </>
        )}
      </div>
      {context && <div className="small faint">on: {context}</div>}
      <div className="flagbox-msg">{flag.message}</div>
      {flag.raw_value && <div className="raw">source sent: {flag.raw_value}</div>}
      {resolved && (
        <div className="small faint" style={{ marginTop: 4 }}>
          Acknowledged by {flag.resolved_by} · {formatDateTime(flag.resolved_at)}
          {flag.resolution_note && ` — ${flag.resolution_note}`}
        </div>
      )}
    </div>
  );
}

function CreateItemModal({
  owners,
  busy,
  onClose,
  onSubmit,
}: {
  owners: string[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: {
    title: string;
    description?: string | null;
    owner?: string | null;
    priority?: Priority;
    due_date?: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [touched, setTouched] = useState(false);

  const titleError =
    touched && title.trim().length < 3 ? "Title must be at least 3 characters." : null;

  const submit = () => {
    setTouched(true);
    if (title.trim().length < 3) return;
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      owner: owner || null,
      priority,
      due_date: dueDate || null,
    });
  };

  return (
    <Modal
      title="Create action item"
      description="Tracked work against this directive. Starts in Pending."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create item"}
          </button>
        </>
      }
    >
      <Field label="Title" error={titleError}>
        <input
          className="input"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Reassess nitrosamine risk for sartan portfolio"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="input"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid cols-2">
        <Field label="Owner">
          <select className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            className="select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            {PRIORITIES.filter((p) => p !== "UNSPECIFIED").map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Due date">
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

function FlagModal({
  items,
  busy,
  onClose,
  onSubmit,
}: {
  items: ActionItem[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: {
    issue: FlagIssue;
    severity: FlagSeverity;
    field?: string;
    message: string;
    action_item_id?: number | null;
  }) => void;
}) {
  const [issue, setIssue] = useState<FlagIssue>("CONFLICTING_STATUS");
  const [severity, setSeverity] = useState<FlagSeverity>("WARNING");
  const [field, setField] = useState("record");
  const [message, setMessage] = useState("");
  const [itemId, setItemId] = useState("");
  const [touched, setTouched] = useState(false);

  const messageError =
    touched && message.trim().length < 3 ? "Describe the issue in a few words." : null;

  const submit = () => {
    setTouched(true);
    if (message.trim().length < 3) return;
    onSubmit({
      issue,
      severity,
      field: field.trim() || "record",
      message: message.trim(),
      action_item_id: itemId ? Number(itemId) : null,
    });
  };

  return (
    <Modal
      title="Flag this record"
      description="Raise a data-quality issue the automated pipeline could not detect. Manual flags survive revalidation."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? "Flagging…" : "Raise flag"}
          </button>
        </>
      }
    >
      <div className="grid cols-2">
        <Field label="Issue type">
          <select
            className="select"
            value={issue}
            onChange={(e) => setIssue(e.target.value as FlagIssue)}
          >
            {FLAG_ISSUES.map((i) => (
              <option key={i} value={i}>
                {label(i)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select
            className="select"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FlagSeverity)}
          >
            {(["CRITICAL", "WARNING", "INFO"] as FlagSeverity[]).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Field">
        <input className="input" value={field} onChange={(e) => setField(e.target.value)} />
      </Field>
      <Field label="Applies to">
        <select className="select" value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">The directive as a whole</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title.slice(0, 60)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What is wrong?" error={messageError}>
        <textarea
          className="input"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="e.g. Effective date contradicts the notice published in the official register."
        />
      </Field>
    </Modal>
  );
}
