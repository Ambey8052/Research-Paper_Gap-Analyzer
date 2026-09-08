import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

const STEPS = [
  { title: "Enter a topic", description: "Type a research topic (e.g. \"agentic AI in healthcare\") on the home page and click Analyze." },
  { title: "Watch the pipeline run", description: "Four agents run in order — Paper Finder, Classifier, Literature Review, Gap Detector. The full run typically takes well under a minute." },
  { title: "Explore the results", description: "Switch between the Gaps, Literature Review, and Papers tabs once the pipeline completes." },
];

const FAQS = [
  {
    q: "Why is the first search slow?",
    a: "The backend runs on a free hosting tier that sleeps after 15 minutes of inactivity. The first request after a lull takes 30-50 seconds to wake it up — after that, requests are fast. This is normal, not a bug.",
  },
  {
    q: "What is the Research Gap Confidence Score (RGCS)?",
    a: "A 0-100 score on each suggested gap, blending how sparse the existing literature is, how recent the nearby work is, citation trends, and the model's own novelty estimate — see the About page for the full breakdown. It's meant to be a starting point for your own judgment, not a verdict.",
  },
  {
    q: "Where do the papers come from?",
    a: "arXiv and Semantic Scholar, both searched live for every session — nothing is pre-loaded or cached from a fixed dataset.",
  },
  {
    q: "A search failed — what do I do?",
    a: "Free-tier APIs occasionally return a temporary \"high demand\" error. Just try the search again; the app already retries transient failures automatically before giving up.",
  },
  {
    q: "Can I delete my search history?",
    a: "Yes — on the home page, use \"Select\" next to Recent Sessions to pick one or more, or use the trash icon on a single session, then confirm deletion.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-medium text-brand-600">Help</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        Using ResearchMind
      </h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-slate-900">{step.title}</p>
                <p className="mt-0.5 text-sm text-slate-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">FAQ</h2>
        <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                {faq.q}
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-2 text-sm text-slate-500">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-10 text-sm text-slate-500">
        Still stuck? Head back to the{" "}
        <Link to="/" className="font-medium text-brand-600 hover:underline">
          home page
        </Link>{" "}
        and try again, or check the About page for how the scoring works.
      </p>
    </div>
  );
}
