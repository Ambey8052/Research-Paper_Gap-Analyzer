import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function Prose({ children }) {
  return (
    <div className="prose-review prose prose-slate max-w-none prose-p:leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export default function LiteratureReview({ review }) {
  if (!review || !review.introduction) {
    return <p className="text-sm text-slate-500">Literature review not generated yet.</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Introduction</h3>
        <Prose>{review.introduction}</Prose>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Related Work</h3>
        <div className="space-y-4">
          {review.relatedWork?.map((rw) => (
            <div key={rw.cluster} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-medium text-slate-900">{rw.cluster}</h4>
                <span className="text-xs text-slate-400">{rw.paperCount} papers</span>
              </div>
              <Prose>{rw.summary}</Prose>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Research Trends</h3>
        <Prose>{review.trends}</Prose>
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Comparison Table</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Paper</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Cluster</th>
                <th className="px-4 py-3">Citations</th>
                <th className="px-4 py-3">Key Contribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {review.comparisonTable?.map((row) => (
                <tr key={row.paperId}>
                  <td className="max-w-xs px-4 py-3 font-medium text-slate-900">{row.title}</td>
                  <td className="px-4 py-3 text-slate-600">{row.year || "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.cluster}</td>
                  <td className="px-4 py-3 text-slate-600">{row.citationCount ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">{row.keyContribution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
