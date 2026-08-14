import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

const EXAMPLE_TOPICS = [
  "Agentic AI in healthcare",
  "Retrieval-augmented generation for scientific literature",
  "Multi-agent LLM coordination",
];

export default function TopicForm({ onSubmit, submitting }) {
  const [topic, setTopic] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (topic.trim().length < 3) return;
    onSubmit(topic.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <Search className="ml-2 h-5 w-5 text-slate-400" />
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Agentic AI in healthcare"
          className="flex-1 border-none bg-transparent px-1 py-2 text-slate-900 outline-none placeholder:text-slate-400"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || topic.trim().length < 3}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Starting..." : "Analyze"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLE_TOPICS.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setTopic(example)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}
