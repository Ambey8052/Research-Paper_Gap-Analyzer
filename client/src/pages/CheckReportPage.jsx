import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, Printer, Trash2 } from "lucide-react";
import { fetchCheck, deleteCheck } from "../api/researchApi.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const POLL_INTERVAL_MS = 2500;
const ACTIVE_STATUSES = new Set(["pending", "running"]);
// Directions are deliberately not hard-coded: each feature's effect comes from the calibrated
// weights, and the "typical" values show what human vs AI text actually scored in calibration.
const FEATURE_INFO = {
  sentenceLengthCV: { label: "Burstiness (sentence-length variation)", meaning: "How much sentence lengths vary — a mix of short and long, or uniform." },
  meanSentenceLength: { label: "Average sentence length", meaning: "Words per sentence." },
  typeTokenRatio: { label: "Vocabulary richness", meaning: "Share of distinct words in each 120-word window." },
  meanWordLength: { label: "Average word length", meaning: "Letters per word." },
  longWordRate: { label: "Long words", meaning: "Share of words with 9+ letters." },
  commaRate: { label: "Commas", meaning: "Commas per word." },
  stopwordRate: { label: "Function words", meaning: "Share of short words like \"the\", \"of\", \"and\"." },
  digitRate: { label: "Concrete numbers", meaning: "Numbers per word (citation markers are ignored)." },
  parenRate: { label: "Parentheses", meaning: "Parenthetical remarks per word." },
  acronymRate: { label: "Acronyms", meaning: "All-caps terms like CNN or ILSVRC per word." },
  weRate: { label: "\"We\" / \"our\"", meaning: "First-person plural per word." },
  markerRate: { label: "AI-typical phrases", meaning: "Words overused by LLMs (e.g. \"delve\", \"pivotal\", \"tapestry\") per 100 words." },
};

function direction(weight) {
  if (Math.abs(weight) < 0.1) return "barely affects the score";
  return weight > 0 ? "higher values push toward AI" : "lower values push toward AI";
}

function useCheck(checkId) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await fetchCheck(checkId);
        if (cancelled) return;
        setReport(data);
        if (ACTIVE_STATUSES.has(data.status)) setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      }
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [checkId]);
  return { report, error };
}

function similarityTone(pct) {
  if (pct < 10) return "text-emerald-600";
  if (pct < 25) return "text-amber-600";
  return "text-red-600";
}

function aiTone(p) {
  if (p < 0.4) return "text-emerald-600";
  if (p < 0.7) return "text-amber-600";
  return "text-red-600";
}

function SummaryCard({ title, value, valueClass, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className={`mt-1 text-3xl font-bold ${valueClass}`}>{value}</p>
      <div className="mt-2 space-y-0.5 text-xs text-slate-500">{children}</div>
    </div>
  );
}

function sentenceClasses(sentence, show) {
  const classes = ["rounded px-0.5 transition"];
  const match = sentence.match?.type ? sentence.match : null;
  if (show.plagiarism && match) {
    if (sentence.cited) classes.push("bg-slate-100 underline decoration-slate-400 decoration-dotted");
    else classes.push(match.type === "exact" ? "bg-red-100" : "bg-orange-100");
    classes.push("cursor-pointer hover:ring-2 hover:ring-brand-200");
  }
  if (sentence.quoted) classes.push("text-slate-400");
  return classes.join(" ");
}

function HighlightedText({ report }) {
  const [show, setShow] = useState({ plagiarism: true });
  const [selected, setSelected] = useState(null);
  const selectedSentence = selected !== null ? report.sentences[selected] : null;
  const source = selectedSentence?.match?.type ? report.sources[selectedSentence.match.sourceIndex] : null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900">Your text</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {report.plagiarism && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={show.plagiarism} onChange={(e) => setShow((s) => ({ ...s, plagiarism: e.target.checked }))} />
              <span className="rounded bg-red-100 px-1">exact</span>
              <span className="rounded bg-orange-100 px-1">paraphrase</span>
              <span className="rounded bg-slate-100 px-1 underline decoration-dotted">cited</span>
            </label>
          )}
        </div>
      </div>

      <p className="text-[15px] leading-8 text-slate-800">
        {report.sentences.map((s, i) => (
          <span key={i}>
            <span
              className={sentenceClasses(s, show)}
              onClick={() => s.match?.type && setSelected(i === selected ? null : i)}
            >
              {s.text}
            </span>{" "}
          </span>
        ))}
      </p>

      {selectedSentence && source && (
        <div className="sticky bottom-4 mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm shadow-lg">
          <p className="font-medium text-slate-900">
            {selectedSentence.match.type === "exact" ? "Exact overlap" : "Paraphrase"} ·{" "}
            {selectedSentence.match.type === "exact"
              ? `${Math.round(selectedSentence.match.score * 100)}% of word sequences shared`
              : `${Math.round(selectedSentence.match.score * 100)}% semantic similarity`}
            {selectedSentence.cited && " · cited in your text"}
          </p>
          <p className="mt-2 italic text-slate-700">“{selectedSentence.match.sourceSentence}”</p>
          <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-brand-700 hover:underline">
            [{selectedSentence.match.sourceIndex + 1}] {source.title} ({source.year || "n.d."})
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      )}
    </section>
  );
}

function SourcesList({ sources }) {
  if (sources.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Matched sources</h2>
      <ol className="space-y-3">
        {sources.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="w-14 shrink-0 text-right font-semibold text-red-600">{s.matchedPercent}%</span>
            <div>
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:text-brand-600">
                [{i + 1}] {s.title}
              </a>
              <p className="text-xs text-slate-500">
                {[s.authors?.join(", "), s.venue, s.year].filter(Boolean).join(" · ")} · {s.matchedSentences} sentence
                {s.matchedSentences === 1 ? "" : "s"} · via {s.origin}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function AiBreakdown({ ai }) {
  if (!ai || ai.skipped) return null;
  const metrics = ai.metrics || {};
  const ood = ai.outOfDistribution;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Why this AI score</h2>
      <p className="mt-1 text-sm text-slate-600">
        Twelve measurable writing-style signals, combined by a model trained on human-written vs AI-written research abstracts.
        Bars to the right pushed this text's score toward "AI", bars to the left toward "human".
      </p>
      <div className="mt-4 divide-y divide-slate-100">
        {Object.entries(FEATURE_INFO).map(([key, info]) => {
          const push = ai.contributions?.[key] ?? 0;
          const width = Math.min(50, Math.abs(push) * 20);
          return (
            <div key={key} className="grid gap-2 py-3 sm:grid-cols-[1fr_180px] sm:items-center">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {info.label}: <span className="font-mono">{ai.features?.[key]}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {info.meaning} In calibration: typical human {ai.typical?.[key]?.human}, typical AI{" "}
                  {ai.typical?.[key]?.ai}; {direction(ai.weights?.[key] ?? 0)}.
                </p>
              </div>
              <div className="relative h-2 rounded-full bg-slate-100" title={`Contribution ${push}`}>
                <div className="absolute left-1/2 top-0 h-2 w-px bg-slate-300" />
                <div
                  className={`absolute top-0 h-2 rounded-full ${push >= 0 ? "bg-violet-500" : "bg-emerald-500"}`}
                  style={push >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {ai.markerHits?.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">AI-typical phrases found: {ai.markerHits.join(", ")}</p>
      )}
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        Measured on {metrics.samples} held-out research abstracts: the "Likely AI-generated" label
        (score ≥ {Math.round((ai.thresholds?.likelyAi || 0) * 100)}%) wrongly flagged{" "}
        {Math.round((metrics.falsePositiveRate || 0) * 1000) / 10}% of human texts and caught{" "}
        {Math.round((metrics.recall || 0) * 100)}% of AI texts.
        {ood && (
          <>
            {" "}On harder, unseen text it wrongly flagged {Math.round((ood.humanFalsePositiveRate || 0) * 1000) / 10}%
            of human abstracts from other fields and caught {pct(ood.recallByPrompt?.nonNative)} of "non-native style"
            AI text, {pct(ood.recallByPrompt?.informal)} of informal AI summaries and{" "}
            {pct(ood.recallByPrompt?.rewriteHuman)} of human abstracts rewritten by AI.
          </>
        )}{" "}
        Trained on Gemini-written text only — other AI models may score differently. Individual sentences aren't
        scored: style statistics need a whole passage to mean anything. {ai.wordsAnalysed?.toLocaleString()} words analysed.
      </p>
    </section>
  );
}

export default function CheckReportPage() {
  const { id } = useParams();
  const { report, error } = useCheck(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();

  useDocumentTitle(report?.title ? `${report.title} — Check report` : "Check report — ResearchMind");

  async function handleDelete() {
    await deleteCheck(id).catch(() => {});
    navigate("/checker");
  }

  const p = report?.plagiarism;
  const ai = report?.ai;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/checker" className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> New check
        </Link>
        {report?.status === "completed" && (
          <div className="flex gap-2">
            <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Printer className="h-4 w-4" aria-hidden="true" /> Print / PDF
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete report
            </button>
          </div>
        )}
      </div>

      <p className="text-sm font-medium text-brand-600">Plagiarism &amp; AI check</p>
      <h1 className="text-2xl font-bold text-slate-900">{report?.title || "Untitled text"}</h1>

      {error && <p className="mt-6 text-red-600">{error}</p>}
      {!report && !error && <p className="mt-6 text-slate-500">Loading report...</p>}

      {report && ACTIVE_STATUSES.has(report.status) && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-5">
          <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden="true" />
          <div>
            <p className="font-medium text-slate-900">{report.progressMessage}</p>
            <p className="text-sm text-slate-600">Usually 30-90 seconds, longer for long documents.</p>
          </div>
        </div>
      )}

      {report?.status === "failed" && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Check failed: {report.errorMessage}</div>
      )}

      {report?.status === "completed" && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-slate-500">
            {report.wordCount?.toLocaleString()} words analysed
            {report.referencesRemoved && " · reference list excluded"}
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            {p && (
              <SummaryCard title="Similarity" value={`${p.similarityPercent}%`} valueClass={similarityTone(p.similarityPercent)}>
                <p>{p.exactPercent}% exact · {p.paraphrasePercent}% paraphrased (uncited)</p>
                <p>{p.citedMatchPercent}% matched but cited · {p.quotedPercent}% quoted (excluded)</p>
              </SummaryCard>
            )}
            {ai && !ai.skipped && (
              <SummaryCard title="AI-generated likelihood" value={`${Math.round(ai.probability * 100)}%`} valueClass={aiTone(ai.probability)}>
                <p className="font-medium">{ai.label}</p>
                <p>An estimate, not proof — see breakdown below.</p>
              </SummaryCard>
            )}
            {ai?.skipped && (
              <SummaryCard title="AI-generated likelihood" value="—" valueClass="text-slate-400">
                <p>{ai.skipped}</p>
              </SummaryCard>
            )}
            {p && (
              <SummaryCard title="Matched sources" value={report.sources.length} valueClass="text-slate-900">
                <p>out of {p.sourcesSearched} candidate papers searched</p>
                <p>via OpenAlex, arXiv & Semantic Scholar</p>
              </SummaryCard>
            )}
          </div>

          <HighlightedText report={report} />
          <SourcesList sources={report.sources} />
          <AiBreakdown ai={ai} />

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            <p className="font-medium">Read these results with care</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Plagiarism is checked against paper titles and abstracts in open databases — not full texts, paywalled papers, theses, or the web. A low score is not a guarantee of originality.</li>
              <li>AI detection is statistical. Technical jargon, formulaic writing, and non-native English can look "AI-like"; lightly edited AI text can look human. Never treat it as proof of misconduct.</li>
              <li>For submission, also use your institution's checker (e.g. Turnitin or iThenticate).</li>
            </ul>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this report?"
        description="The report and the text it contains are deleted permanently."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
