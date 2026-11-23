import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileUp, Loader2, ScanSearch, ShieldCheck, Bot, Lock } from "lucide-react";
import { createCheck } from "../api/researchApi.js";
import { extractTextFromFile } from "../utils/extractText.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

const MAX_CHARS = 60000;
const RECENT_KEY = "researchmind.recentChecks";

/** Report ids are only remembered in this browser — the server never lists checks. */
export function rememberCheck(checkId, title) {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((c) => c.id !== checkId);
    recent.unshift({ id: checkId, title: title || "Untitled text", at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 10)));
  } catch {
    // Storage unavailable (private mode etc.) — the report link still works.
  }
}

function loadRecentChecks() {
  try {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; // reports expire server-side after 7 days
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((c) => c.at > weekAgo);
  } catch {
    return [];
  }
}

function wordCount(text) {
  return (text.match(/\S+/g) || []).length;
}

export default function CheckerPage() {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [checks, setChecks] = useState({ plagiarism: true, ai: true });
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState([]);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  useDocumentTitle("Plagiarism & AI Content Checker — ResearchMind");
  useEffect(() => setRecent(loadRecentChecks()), []);

  async function handleFile(file) {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const extracted = await extractTextFromFile(file);
      setText(extracted.slice(0, MAX_CHARS));
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
      if (extracted.length > MAX_CHARS) setError(`Only the first ${MAX_CHARS.toLocaleString()} characters were kept.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { checkId } = await createCheck({ text, title, checks });
      rememberCheck(checkId, title);
      navigate(`/checker/${checkId}`);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setSubmitting(false);
    }
  }

  const words = wordCount(text);
  const canSubmit = words >= 50 && text.length <= MAX_CHARS && (checks.plagiarism || checks.ai) && !submitting;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm font-medium text-brand-600">Tool</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Plagiarism &amp; AI content checker</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        Finds copied or closely paraphrased sentences by comparing your text against published
        research, and estimates how likely it is to be AI-generated — with every score explained.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Title (optional, only shown in your report)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files[0]);
          }}
          className="rounded-xl border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="Paste your paper, abstract, or essay here — or drop a PDF / DOCX file."
            className="w-full resize-y rounded-t-xl border-none bg-transparent p-4 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {extracting ? "Reading file..." : "Upload PDF, DOCX or TXT"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.tex"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <span className={text.length > MAX_CHARS ? "text-red-600" : ""}>
              {words.toLocaleString()} words · {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          {[
            { key: "plagiarism", icon: ScanSearch, label: "Plagiarism check", hint: "copied & paraphrased sentences" },
            { key: "ai", icon: Bot, label: "AI content detection", hint: "likelihood text is machine-written" },
          ].map(({ key, icon: Icon, label, hint }) => (
            <label key={key} className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="flex items-center gap-1 text-sm font-medium text-slate-800">
                  <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" /> {label}
                </span>
                <span className="text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {submitting ? "Starting..." : "Run check"}
          </button>
          {words > 0 && words < 50 && <span className="text-sm text-slate-500">At least 50 words needed.</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-8 flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <div>
          <p>
            Files are read in your browser and never uploaded. To find candidate sources, short keyword
            queries built from your text are sent to OpenAlex, arXiv and Semantic Scholar — never the
            full text. Reports are deleted automatically after 7 days and are reachable only by their link.
          </p>
          <p className="mt-1">
            How the scores work: <Link to="/guide" className="font-medium text-brand-600 hover:underline">Results Guide</Link>.
          </p>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-slate-500">Your recent checks (this browser)</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {recent.map((c) => (
              <li key={c.id}>
                <Link to={`/checker/${c.id}`} className="flex justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                  <span className="truncate font-medium text-slate-800">{c.title}</span>
                  <span className="shrink-0 text-slate-400">{new Date(c.at).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
