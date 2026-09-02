import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../components/PageHeader";
import { EmptyState, Icons, Modal, Field, useToast } from "../components/ui";
import { describeFilters, savedViews, type SavedView } from "../lib/savedViews";
import { formatDateTime } from "../lib/format";

/**
 * Saved Views — named filter sets for the Updates queue.
 *
 * Applying a view navigates to /updates carrying the filters in router state, so
 * the queue stays the single implementation of the table and this screen stays a
 * thin index over it.
 */
export function SavedViewsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [views, setViews] = useState<SavedView[]>(savedViews.list);
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    const refresh = () => setViews(savedViews.list());
    window.addEventListener("artixio:views-changed", refresh);
    return () => window.removeEventListener("artixio:views-changed", refresh);
  }, []);

  const apply = (view: SavedView) => {
    navigate("/updates", { state: { filters: view.filters } });
  };

  return (
    <>
      <PageHeader
        title="Saved Views"
        eyebrow="View index · stored filter sets"
        subtitle="Stored filter sets for the regulatory update queue"
        actions={
          <button className="btn primary" onClick={() => navigate("/updates")}>
            <Icons.plus /> Create in queue
          </button>
        }
      />

      <div className="page">
        {views.length === 0 ? (
          <div className="card">
            <EmptyState
              title="No saved views yet"
              body="Filter the Updates queue the way you like it, then use Save View to store it here."
            />
          </div>
        ) : (
          <div className="grid cols-3">
            {views.map((view) => (
              <div className="card" key={view.id}>
                <div className="card-head">
                  <h2 style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {view.name}
                  </h2>
                  <span className="toolbar-spacer" />
                  <span className="pill neutral">
                    {view.filters.sort} {view.filters.order}
                  </span>
                </div>
                <div className="card-body">
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 16,
                      fontSize: 12,
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    {describeFilters(view.filters).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <div className="small faint" style={{ marginTop: 8 }}>
                    Saved {formatDateTime(view.createdAt)}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn primary sm" onClick={() => apply(view)}>
                      Apply view
                    </button>
                    <button
                      className="btn sm"
                      onClick={() => {
                        setRenaming(view);
                        setDraftName(view.name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={() => {
                        savedViews.remove(view.id);
                        setViews(savedViews.list());
                        toast.success(`Deleted "${view.name}"`);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="small faint" style={{ marginTop: 16 }}>
          Saved views are stored in this browser only. They are a personal working
          preference rather than regulatory data, so they deliberately do not create a
          user record in the database — the trade-off is that they do not follow you
          between machines.
        </p>
      </div>

      {renaming && (
        <Modal
          title="Rename view"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!draftName.trim()}
                onClick={() => {
                  savedViews.rename(renaming.id, draftName);
                  setViews(savedViews.list());
                  setRenaming(null);
                  toast.success("View renamed");
                }}
              >
                Save
              </button>
            </>
          }
        >
          <Field label="View name">
            <input
              className="input"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
