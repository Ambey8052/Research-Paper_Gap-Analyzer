function scoreColor(score) {
  if (score >= 70) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (score >= 40) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-slate-500 bg-slate-50 border-slate-200";
}

function BreakdownBar({ label, value }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-brand-500"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

export default function GapCard({ gap }) {
  const breakdown = gap.scoreBreakdown || {};

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-start justify-between gap-4">
        <h4 className="font-semibold text-slate-900">{gap.title}</h4>
        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-sm font-semibold ${scoreColor(gap.rgcs)}`}
          title="Research Gap Confidence Score"
        >
          RGCS {gap.rgcs}
        </span>
      </div>

      <p className="text-sm text-slate-600">{gap.description}</p>

      {gap.rationale && (
        <p className="mt-2 text-sm italic text-slate-500">Why it looks like a gap: {gap.rationale}</p>
      )}

      {gap.relatedClusters?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {gap.relatedClusters.map((cluster) => (
            <span
              key={cluster}
              className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {cluster}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
        <BreakdownBar label="Sparsity" value={breakdown.sparsityScore ?? 0} />
        <BreakdownBar label="Recency" value={breakdown.recencyScore ?? 0} />
        <BreakdownBar label="Citation trend" value={breakdown.citationTrendScore ?? 0} />
        <BreakdownBar label="LLM novelty" value={breakdown.llmNoveltyScore ?? 0} />
      </div>
    </div>
  );
}
