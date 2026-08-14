import { ExternalLink } from "lucide-react";

export default function PaperList({ papers = [] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Cluster</th>
            <th className="px-4 py-3">Year</th>
            <th className="px-4 py-3">Citations</th>
            <th className="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {papers.map((paper) => (
            <tr key={paper._id} className="hover:bg-slate-50">
              <td className="max-w-md px-4 py-3">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-1 font-medium text-slate-900 hover:text-brand-600"
                >
                  {paper.title}
                  <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-slate-400" />
                </a>
              </td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                  {paper.cluster || "Uncategorized"}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-600">{paper.year || "—"}</td>
              <td className="px-4 py-3 text-slate-600">{paper.citationCount ?? 0}</td>
              <td className="px-4 py-3 text-slate-500 capitalize">{paper.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
