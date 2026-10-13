import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { createPaperDraft, fetchPaperDrafts, deletePaperDraft } from "../api/researchApi.js";
import ConfirmDialog from "./ConfirmDialog.jsx";

const MAX_GAPS = 4;

const STATUS_STYLES = {
  completed: "bg-emerald-50 text-emerald-700",
  running: "bg-brand-50 text-brand-700",
  pending: "bg-slate-100 text-slate-600",
  failed: "bg-red-50 text-red-700",
};

/** Turns the selected gaps into an IEEE-style research paper draft, and lists earlier drafts. */
export default function PaperGeneratorPanel({ sessionId, selectedIndexes, gaps, onClearSelection }) {
  const [authors, setAuthors] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPaperDrafts(sessionId).then(setDrafts).catch(() => {});
  }, [sessionId]);

  const count = selectedIndexes.length;
  const tooMany = count > MAX_GAPS;

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    try {
      const { draftId } = await createPaperDraft(sessionId, {
        gapIndexes: selectedIndexes,
        authors,
        affiliation,
      });
      navigate(`/session/${sessionId}/draft/${draftId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    const draftId = pendingDelete;
    setPendingDelete(null);
    try {
      await deletePaperDraft(sessionId, draftId);
      setDrafts((prev) => prev.filter((d) => d._id !== draftId));
    } catch {
      // List stays as-is; user can retry.
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-5">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h3 className="font-semibold text-slate-900">Write a research paper from selected gaps</h3>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Tick one or more gaps below (up to {MAX_GAPS}). They're combined into one coherent
        IEEE-format proposal paper — abstract, related work, research gap, proposed approach,
        evaluation protocol — citing the papers found in this session.
      </p>

      {count > 0 && (
        <ol className="mt-3 list-inside list-decimal space-y-0.5 text-sm text-slate-700">
          {selectedIndexes.map((i, n) => (
            <li key={i}>
              {gaps[i]?.title}
              {n === 0 && count > 1 && <span className="text-xs text-slate-400"> (primary focus)</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          maxLength={300}
          placeholder="Author name(s) — optional"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <input
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          maxLength={300}
          placeholder="Department, institution — optional"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={count === 0 || tooMany || submitting}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {count === 0 ? "Select gaps to start" : `Generate paper from ${count} gap${count > 1 ? "s" : ""}`}
        </button>
        {count > 0 && (
          <button type="button" onClick={onClearSelection} className="text-sm text-slate-500 hover:text-slate-800">
            Clear selection
          </button>
        )}
        <span className="text-xs text-slate-400">Takes about 1-2 minutes.</span>
      </div>
      {tooMany && <p className="mt-2 text-sm text-amber-700">Select at most {MAX_GAPS} gaps for one paper.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {drafts.length > 0 && (
        <div className="mt-5 border-t border-brand-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Your drafts</p>
          <ul className="space-y-1">
            {drafts.map((d) => (
              <li key={d._id} className="flex items-center gap-2">
                <Link
                  to={`/session/${sessionId}/draft/${d._id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white"
                >
                  <span className="truncate text-slate-800">{d.title || d.gapTitles?.join(" + ")}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status]}`}>
                    {d.status}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDelete(d._id)}
                  aria-label="Delete draft"
                  className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete paper draft?"
        description="This permanently deletes the draft. The research session and its gaps are kept."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
