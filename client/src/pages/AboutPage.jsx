import { Search, Layers, FileText, Target, Github } from "lucide-react";

const AGENTS = [
  {
    icon: Search,
    name: "Agent 1 — Paper Finder",
    description:
      "Searches arXiv and Semantic Scholar in parallel, dedupes results, and embeds each paper locally for similarity search.",
  },
  {
    icon: Layers,
    name: "Agent 2 — Classifier",
    description:
      "Groups the papers into coherent sub-topic clusters and tags each with keywords, so later agents reason by theme instead of a flat list.",
  },
  {
    icon: FileText,
    name: "Agent 3 — Literature Review Writer",
    description:
      "Synthesizes (not copies) a structured review: an introduction, per-cluster related work, cross-cluster trends, and a comparison table.",
  },
  {
    icon: Target,
    name: "Agent 4 — Gap Detector",
    description:
      "Proposes candidate research gaps grounded in the actual papers, then scores each with the Research Gap Confidence Score below.",
  },
];

const RGCS_WEIGHTS = [
  { label: "Sparsity", weight: "40%", description: "Fewer papers directly on-topic, relative to the whole set, means it's more under-explored." },
  { label: "Recency", weight: "25%", description: "Recent activity nearby suggests a live, moving research area rather than an abandoned one." },
  { label: "Citation trend", weight: "20%", description: "Citation velocity of the closest related papers — is this a \"hot\" area right now?" },
  { label: "LLM novelty", weight: "15%", description: "The model's own estimate, kept as the smallest weight so the score isn't just its opinion restated as a number." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-medium text-brand-600">About this project</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        ResearchMind: an AI research workflow, not a summarizer
      </h1>
      <p className="mt-4 text-slate-600">
        Tools like NotebookLM, Elicit, and SciSpace help you read one paper at a time. ResearchMind
        is built for the step before that: given a topic, it searches, clusters, and reasons across
        20–40 papers together to draft a literature review and surface candidate research gaps —
        automating the part of research that otherwise takes weeks.
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">The four-agent pipeline</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {AGENTS.map((agent) => (
            <div key={agent.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <agent.icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <h3 className="mt-2 font-medium text-slate-900">{agent.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{agent.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Research Gap Confidence Score (RGCS)</h2>
        <p className="mt-2 text-sm text-slate-600">
          Any AI can assert "this looks like a gap." RGCS makes that claim explainable instead of a
          black box — it's a weighted blend of signals computed from real paper metadata, not just
          the model's opinion:
        </p>
        <div className="mt-4 space-y-3">
          {RGCS_WEIGHTS.map((w) => (
            <div key={w.label} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                {w.weight}
              </span>
              <div>
                <p className="font-medium text-slate-900">{w.label}</p>
                <p className="text-sm text-slate-500">{w.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Tech stack</h2>
        <p className="mt-2 text-sm text-slate-600">
          MongoDB Atlas (with Vector Search), Express, React, Node.js — with Google Gemini for
          reasoning and a locally-run embedding model for similarity search, all free-tier.
        </p>
      </section>

      <a
        href="https://github.com/Ambey8052/Research-Paper_Gap-Analyzer"
        target="_blank"
        rel="noreferrer"
        className="mt-10 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <Github className="h-4 w-4" aria-hidden="true" />
        View source on GitHub
      </a>
    </div>
  );
}
