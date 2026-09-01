import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  ApiError,
  type ActionItemStatus,
  type DirectiveDetail,
  type Flag,
} from "../api";

/**
 * Detail panel: the "why" behind a row.
 *
 * Deliberate choice — the status dropdown offers every status, including ones the
 * workflow forbids. The server is the authority on legal transitions, and letting
 * it answer means an illegal move produces a real, explained refusal instead of a
 * silently greyed-out option. Mirroring the rules here would create two sources of
 * truth that drift.
 */

const STATUSES: ActionItemStatus[] = [
  "PENDING",
  "IN_REVIEW",
  "BLOCKED",
  "RESOLVED",
  "DISMISSED",
];

const label = (s: string) =>
  s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

interface Props {
  directiveId: number;
  onClose: () => void;
  onToast: (message: string, ok: boolean) => void;
}

function FlagRow({ flag }: { flag: Flag }) {
  return (
    <div className={`flag ${flag.severity}`}>
      <div className="flag-head">
        <span className="flag-issue">{flag.issue}</span>
        <span className="flag-field">{flag.field}</span>
      </div>
      <div className="flag-msg">{flag.message}</div>
      {flag.raw_value && (
        <div className="flag-raw">source sent: {flag.raw_value}</div>
      )}
    </div>
  );
}

export function DetailPanel({ directiveId, onClose, onToast }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["directive", directiveId],
    queryFn: () => api.directive(directiveId),
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ActionItemStatus }) =>
      api.updateActionItem(id, status),

    // Optimistic: the table and panel update the instant the operator chooses,
    // and roll back together if the server refuses.
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["directive", directiveId] });
      const previous = queryClient.getQueryData<DirectiveDetail>([
        "directive",
        directiveId,
      ]);
      if (previous) {
        queryClient.setQueryData<DirectiveDetail>(["directive", directiveId], {
          ...previous,
          action_items: previous.action_items.map((item) =>
            item.id === id ? { ...item, status } : item,
          ),
        });
      }
      return { previous };
    },

    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["directive", directiveId], context.previous);
      }
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not reach the server. No change was saved.";
      onToast(message, false);
    },

    onSuccess: (item) => {
      onToast(`Marked "${item.title.slice(0, 48)}" as ${label(item.status)}.`, true);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["directive", directiveId] });
      queryClient.invalidateQueries({ queryKey: ["directives"] });
      queryClient.invalidateQueries({ queryKey: ["counts"] });
    },
  });

  if (isLoading || !data) {
    return (
      <aside className="panel">
        <div className="panel-section">Loading…</div>
      </aside>
    );
  }

  const directiveFlags = data.flags.filter((f) => f.action_item_id === null);
  const flagsForItem = (itemId: number) =>
    data.flags.filter((f) => f.action_item_id === itemId);

  return (
    <aside className="panel" aria-label="Directive detail">
      <div className="panel-head">
        <button className="panel-close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
        <span className="ref">{data.reference_code ?? "— no reference code —"}</span>
        <h2>{data.title}</h2>
        <span className={`badge st-${data.status}`}>{data.status}</span>{" "}
        <span className="flag-field">
          {data.authority.code} · {data.authority.jurisdiction}
        </span>
      </div>

      <div className="panel-section">
        <dl className="kv">
          <dt>Published</dt>
          <dd>
            {data.published_date ?? <span className="date-missing">missing</span>}
          </dd>
          <dt>Effective</dt>
          <dd>
            {data.effective_date ?? <span className="date-missing">missing</span>}
          </dd>
          <dt>Type</dt>
          <dd>{data.document_type ?? "—"}</dd>
          <dt>Area</dt>
          <dd>{data.therapeutic_area ?? "—"}</dd>
          <dt>Source</dt>
          <dd>
            {data.source_url ? (
              <a href={data.source_url} target="_blank" rel="noreferrer">
                {data.source_url.replace(/^https?:\/\//, "").slice(0, 40)}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </dl>
      </div>

      {data.summary && (
        <div className="panel-section">
          <h3>Summary</h3>
          <p className="summary-text">{data.summary}</p>
        </div>
      )}

      {directiveFlags.length > 0 && (
        <div className="panel-section">
          <h3>Data quality · {directiveFlags.length} caught on ingest</h3>
          {directiveFlags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} />
          ))}
        </div>
      )}

      <div className="panel-section">
        <h3>
          Action items · {data.open_item_count} open of {data.action_items.length}
        </h3>
        {data.action_items.map((item) => {
          const itemFlags = flagsForItem(item.id);
          const pending = mutation.isPending && mutation.variables?.id === item.id;
          return (
            <div className="item" key={item.id}>
              <div className="item-title">{item.title}</div>
              <div className="item-meta">
                <span className={`prio-${item.priority}`}>
                  {label(item.priority)}
                </span>
                <span>·</span>
                <span>{item.owner ?? "unassigned"}</span>
                <span>·</span>
                <span>
                  due{" "}
                  {item.due_date ?? (
                    <span className="date-missing">not set</span>
                  )}
                </span>
              </div>

              {itemFlags.map((flag) => (
                <FlagRow key={flag.id} flag={flag} />
              ))}

              <div className="item-controls">
                <select
                  value={item.status}
                  disabled={pending}
                  onChange={(event) =>
                    mutation.mutate({
                      id: item.id,
                      status: event.target.value as ActionItemStatus,
                    })
                  }
                >
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
                {pending && <span className="flag-field">saving…</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel-section">
        <h3>Source record as received</h3>
        <details>
          <summary className="flag-field" style={{ cursor: "pointer" }}>
            Show raw payload
          </summary>
          <div className="flag-raw" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
            {JSON.stringify(data.raw_payload, null, 2)}
          </div>
        </details>
      </div>
    </aside>
  );
}
