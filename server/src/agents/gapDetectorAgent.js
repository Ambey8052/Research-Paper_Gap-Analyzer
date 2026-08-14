import { askLLMJSON } from "../services/llmService.js";

const SYSTEM_PROMPT = `You are a research gap detection agent. Given a clustered set of papers
on a topic, propose 3-6 concrete, specific candidate research gaps — areas that are
under-explored relative to the surrounding literature, not generic suggestions like "more
research is needed". Each gap should be grounded in the actual clusters/papers provided: point
to which clusters are adjacent to the gap and which specific papers are the closest existing
work. Do not invent papers that were not given to you.`;

function buildUserPrompt(topic, papers, clusters) {
  const clusterList = clusters.map((c) => `- ${c.name} (${c.paperCount} papers)`).join("\n");
  const paperList = papers
    .map(
      (p) =>
        `[id=${p.externalId}] "${p.title}" (${p.year || "n.d."}, cluster: ${p.cluster}, citations: ${p.citationCount}, topics: ${(p.topics || []).join(", ")})`
    )
    .join("\n");

  return `Research topic: ${topic}

Clusters:
${clusterList}

Papers:
${paperList}

Return JSON in exactly this shape:
{
  "gaps": [
    {
      "title": string,                      // short, specific gap title
      "description": string,                // 2-4 sentences describing the unexplored area
      "relatedClusters": string[],          // cluster names this gap sits adjacent to
      "supportingIds": string[],            // ids of the closest existing papers (evidence, not the gap itself)
      "rationale": string,                  // why this looks like a genuine gap, not just an absence
      "llmNoveltyScore": number             // your own 0-100 estimate of how novel/unexplored this is
    }
  ]
}
The "supportingIds" must match [id=...] values given above.`;
}

const CURRENT_YEAR = new Date().getFullYear();

function computeQuantitativeScores(supportingPapers, allPapers) {
  const totalCount = allPapers.length || 1;
  const supportCount = supportingPapers.length;

  // Fewer directly-related papers relative to the whole corpus -> sparser -> higher score.
  const sparsityScore = clamp(Math.round(100 * (1 - supportCount / totalCount)), 0, 100);

  // Recent supporting evidence suggests the gap sits in an actively moving area.
  const avgAge =
    supportingPapers.reduce((sum, p) => sum + Math.min(CURRENT_YEAR - (p.year || CURRENT_YEAR), 10), 0) /
    (supportCount || 1);
  const recencyScore = clamp(Math.round(100 * (1 - avgAge / 10)), 0, 100);

  // Citation velocity (citations per year since publication), normalized against the corpus max.
  const velocity = (p) => (p.citationCount || 0) / (CURRENT_YEAR - (p.year || CURRENT_YEAR) + 1);
  const maxVelocity = Math.max(...allPapers.map(velocity), 1);
  const avgVelocity = supportingPapers.reduce((sum, p) => sum + velocity(p), 0) / (supportCount || 1);
  const citationTrendScore = clamp(Math.round(100 * (avgVelocity / maxVelocity)), 0, 100);

  return { sparsityScore, recencyScore, citationTrendScore };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Agent 4 — Gap Detector.
 *
 * Gemini proposes candidate gaps grounded in the actual paper set, then we
 * compute the Research Gap Confidence Score (RGCS) as a transparent, weighted
 * blend of quantitative signals plus the LLM's own novelty estimate:
 *
 *   RGCS = 0.40 * sparsity + 0.25 * recency + 0.20 * citationTrend + 0.15 * llmNovelty
 *
 * Weighting sparsity and evidence trends (65%) higher than the raw LLM
 * opinion (15%) keeps the score explainable and resistant to the model
 * simply asserting a high number — the "why" is always visible in the
 * scoreBreakdown returned alongside it.
 */
export async function runGapDetector(topic, papers, clusters) {
  const result = await askLLMJSON(SYSTEM_PROMPT, buildUserPrompt(topic, papers, clusters), 4096);

  const paperByExternalId = new Map(papers.map((p) => [p.externalId, p]));

  const gaps = (result.gaps || []).map((gap) => {
    const supportingPapers = (gap.supportingIds || [])
      .map((id) => paperByExternalId.get(id))
      .filter(Boolean);

    const { sparsityScore, recencyScore, citationTrendScore } = computeQuantitativeScores(
      supportingPapers,
      papers
    );
    const llmNoveltyScore = clamp(Math.round(gap.llmNoveltyScore ?? 50), 0, 100);

    const rgcs = Math.round(
      0.4 * sparsityScore + 0.25 * recencyScore + 0.2 * citationTrendScore + 0.15 * llmNoveltyScore
    );

    return {
      title: gap.title,
      description: gap.description,
      relatedClusters: gap.relatedClusters || [],
      supportingPaperIds: supportingPapers.map((p) => p._id),
      rationale: gap.rationale || "",
      scoreBreakdown: { sparsityScore, recencyScore, citationTrendScore, llmNoveltyScore },
      rgcs,
    };
  });

  return gaps.sort((a, b) => b.rgcs - a.rgcs);
}
