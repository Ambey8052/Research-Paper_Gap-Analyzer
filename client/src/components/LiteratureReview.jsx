import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import { linkCitationsMarkdown, refNumbersByPaperId } from "../utils/citations.js";

const ANCHOR_PREFIX = "review-ref-";

function Prose({ children }) {
  return (
    <div className="prose-review prose prose-slate max-w-none prose-p:leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {linkCitationsMarkdown(children, ANCHOR_PREFIX)}
      </ReactMarkdown>
    </div>
  );
}

function RefBadge({ refNumber }) {
  if (!refNumber) return null;
  return (
    <a
      href={`#${ANCHOR_PREFIX}${refNumber}`}
      className="shrink-0 font-mono text-xs font-medium text-brand-600 hover:underline"
    >
      [{refNumber}]
    </a>
  );
}

/** The actual papers behind a cluster's "N papers" count, listed under its summary. */
function ClusterPapers({ papers, refByPaperId }) {
  if (papers.length === 0) return null;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Papers in this theme
      </p>
      <ul className="space-y-1.5">
        {papers.map((paper) => (
          <li key={paper._id} className="flex items-start gap-2 text-sm">
            <RefBadge refNumber={refByPaperId.get(String(paper._id))} />
            <a
              href={paper.url}
              target="_blank"
              rel="noreferrer"
              className="text-slate-700 hover:text-brand-600"
            >
              {paper.title}
              <span className="text-slate-400">
                {" "}
                ({paper.year || "n.d."}
                {paper.authors?.length ? `, ${paper.authors[0]}${paper.authors.length > 1 ? " et al." : ""}` : ""})
              </span>
              <ExternalLink className="ml-1 inline h-3 w-3 text-slate-400" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LiteratureReview({ review, papers = [] }) {
  if (!review || !review.introduction) {
    return <p className="text-sm text-slate-500">Literature review not generated yet.</p>;
  }

  const refByPaperId = refNumbersByPaperId(review.references);
  const byRef = (a, b) =>
    (refByPaperId.get(String(a._id)) ?? Infinity) - (refByPaperId.get(String(b._id)) ?? Infinity);
  const papersInCluster = (cluster) => papers.filter((p) => p.cluster === cluster).sort(byRef);

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
              <ClusterPapers papers={papersInCluster(rw.cluster)} refByPaperId={refByPaperId} />
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
                {review.references?.length > 0 && <th className="px-4 py-3">Ref</th>}
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
                  {review.references?.length > 0 && (
                    <td className="px-4 py-3">
                      <RefBadge refNumber={row.ref} />
                    </td>
                  )}
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

      {review.references?.length > 0 ? (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-slate-900">References</h3>
          <ol className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {review.references.map((r) => (
              <li key={r.ref} id={`${ANCHOR_PREFIX}${r.ref}`} className="flex scroll-mt-6 gap-3">
                <span className="w-8 shrink-0 text-right font-mono text-slate-400">[{r.ref}]</span>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="text-xs text-slate-400">
          This session was generated before citations were added — run the topic again to get
          numbered citations and an IEEE reference list.
        </p>
      )}
    </div>
  );
}
