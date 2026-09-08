import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, ListChecks, Loader2, Trash2, X } from "lucide-react";
import { fetchRecentSessions, deleteSession } from "../api/researchApi.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const STATUS_STYLES = {
  completed: "bg-emerald-50 text-emerald-700",
  running: "bg-brand-50 text-brand-700",
  pending: "bg-slate-100 text-slate-600",
  failed: "bg-red-50 text-red-700",
};

export default function RecentSessionsList() {
  const [sessions, setSessions] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [pendingDelete, setPendingDelete] = useState(null); // { ids, label } | null
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRecentSessions().then(setSessions).catch(() => {});
  }, []);

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.size === sessions.length ? new Set() : new Set(sessions.map((s) => s._id))));
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await Promise.all(pendingDelete.ids.map((id) => deleteSession(id)));
      setSessions((prev) => prev.filter((s) => !pendingDelete.ids.includes(s._id)));
      exitSelectMode();
    } catch {
      // Session list stays as-is; user can retry the delete.
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  }

  if (sessions.length === 0) return null;

  const allSelected = selectedIds.size === sessions.length && sessions.length > 0;

  return (
    <div className="mt-16 w-full max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <Clock className="h-4 w-4" aria-hidden="true" /> Recent sessions
        </h2>

        {selectMode ? (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Select all
            </label>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() =>
                setPendingDelete({
                  ids: Array.from(selectedIds),
                  label:
                    selectedIds.size === 1
                      ? "this session"
                      : `these ${selectedIds.size} sessions`,
                })
              }
              className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </button>
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Cancel selection"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            Select
          </button>
        )}
      </div>

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {sessions.map((s) => (
          <li key={s._id} className="flex items-center gap-2 px-2 py-1">
            {selectMode && (
              <input
                type="checkbox"
                checked={selectedIds.has(s._id)}
                onChange={() => toggleSelected(s._id)}
                aria-label={`Select session: ${s.topic}`}
                className="ml-2 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
            )}
            <button
              onClick={() => (selectMode ? toggleSelected(s._id) : navigate(`/session/${s._id}`))}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="truncate font-medium text-slate-800">{s.topic}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[s.status]}`}
              >
                {s.status}
              </span>
            </button>
            {!selectMode && (
              <button
                type="button"
                onClick={() => setPendingDelete({ ids: [s._id], label: "this session" })}
                aria-label={`Delete session: ${s.topic}`}
                className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete session history?"
        description={`This permanently deletes ${pendingDelete?.label} and its papers, review, and gaps. This can't be undone.`}
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        confirmDisabled={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
