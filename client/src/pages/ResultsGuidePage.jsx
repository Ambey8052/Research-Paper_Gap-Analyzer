import { Search, Loader2, BookOpen, Target } from "lucide-react";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

const PIPELINE_STEPS = [
  { name: "Paper Finder", meaning: "Searching arXiv and Semantic Scholar for papers on your topic." },
  { name: "Classifier", meaning: "Sorting the papers found into a handful of themed groups (clusters)." },
  { name: "Literature Review", meaning: "Writing the introduction, per-theme summaries, and comparison table." },
  { name: "Gap Detector", meaning: "Looking across the themes for under-explored areas and scoring each one." },
];

const PAPERS_COLUMNS = [
  { name: "Title", meaning: "Click it to open the original paper on arXiv or Semantic Scholar." },
  { name: "Cluster", meaning: "Which theme this paper got sorted into — matches the Literature Review's sections." },
  { name: "Year", meaning: "Publication year." },
  { name: "Citations", meaning: "How many other papers cite this one — a rough signal of impact (very new papers will show 0, that's normal)." },
  { name: "Source", meaning: "Where it was found — arXiv or Semantic Scholar." },
];

const REVIEW_SECTIONS = [
  { name: "Introduction", meaning: "A short overview of the topic and what this review covers." },
  { name: "Related Work", meaning: "One write-up per theme, summarizing what those papers do in common." },
  { name: "Research Trends", meaning: "Observations about how the different themes relate to or build on each other." },
  { name: "Comparison Table", meaning: "Every paper side by side with a one-line summary of its core contribution." },
];

const RGCS_PARTS = [
  { name: "Sparsity", meaning: "How few existing papers directly cover this specific idea. Fewer papers on it = more of a gap." },
  { name: "Recency", meaning: "How recently the closest related papers were published. Recent activity means the area is still being actively worked on." },
  { name: "Citation trend", meaning: "Whether the closest related papers are picking up citations quickly — a sign this is a \"hot\" area worth building on." },
  { name: "LLM novelty", meaning: "The AI's own guess at how original the idea is. It's counted the least (15%), so the score isn't just the AI's opinion." },
];

function GuideSection({ icon: Icon, title, intro, rows }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      {intro && <p className="mt-2 text-sm text-slate-600">{intro}</p>}
      <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <div key={row.name} className="flex flex-col gap-1 p-4 sm:flex-row sm:gap-4">
            <p className="w-full shrink-0 font-medium text-slate-900 sm:w-40">{row.name}</p>
            <p className="text-sm text-slate-600">{row.meaning}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ResultsGuidePage() {
  useDocumentTitle("Results Guide — ResearchMind");

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-medium text-brand-600">Results guide</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        What am I looking at?
      </h1>
      <p className="mt-4 text-slate-600">
        A plain-language walkthrough of every section you'll see on a results page — what it
        shows and where the data comes from. For the exact scoring formula, see the{" "}
        <a href="/about" className="font-medium text-brand-600 hover:underline">
          About page
        </a>
        .
      </p>

      <GuideSection
        icon={Loader2}
        title="The progress steps"
        intro="Four cards at the top of a results page show the pipeline as it runs, in order:"
        rows={PIPELINE_STEPS}
      />

      <GuideSection
        icon={Target}
        title="The Gaps tab"
        intro="Each card is one suggested under-explored idea. The score badge (0-100) is broken into four bars:"
        rows={RGCS_PARTS}
      />

      <GuideSection
        icon={BookOpen}
        title="The Literature Review tab"
        intro="A written review generated from the papers found, split into these parts:"
        rows={REVIEW_SECTIONS}
      />

      <GuideSection
        icon={Search}
        title="The Papers tab"
        intro="A table of every paper the search turned up. Columns:"
        rows={PAPERS_COLUMNS}
      />
    </div>
  );
}
