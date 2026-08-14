import { askLLMJSON } from "../services/llmService.js";

const SYSTEM_PROMPT = `You are a literature review writing agent. Given a clustered set of
research papers on a topic, synthesize a structured literature review section. Write in a
formal academic tone. Do NOT copy sentences from abstracts verbatim — synthesize and compare
across papers within each cluster. Be specific about what each cluster of work does and how
clusters relate to or build on each other.`;

function buildUserPrompt(topic, papers, clusters) {
  const clusterList = clusters.map((c) => `- ${c.name} (${c.paperCount} papers)`).join("\n");
  const paperList = papers
    .map(
      (p) =>
        `[id=${p.externalId}] "${p.title}" (${p.year || "n.d."}, cluster: ${p.cluster}, citations: ${p.citationCount}) — ${(p.abstract || "").slice(0, 250)}`
    )
    .join("\n");

  return `Research topic: ${topic}

Clusters:
${clusterList}

Papers:
${paperList}

Return JSON in exactly this shape:
{
  "introduction": string,               // 2-3 paragraphs introducing the topic and scope of this review
  "relatedWork": [
    { "cluster": string, "summary": string }   // 1-2 paragraphs synthesizing that cluster's papers
  ],
  "trends": string,                     // 1-2 paragraphs on cross-cluster trends and how the field is moving
  "comparisonTable": [
    { "id": string, "keyContribution": string }  // one line per paper, its core contribution/method
  ]
}
The "id" fields must match the [id=...] values given above. Include every cluster in
relatedWork and every paper in comparisonTable.`;
}

/**
 * Agent 3 — Literature Review.
 * Synthesizes the classified paper set into a structured review: intro,
 * per-cluster related work, cross-cluster trends, and a comparison table.
 */
export async function runLiteratureReview(topic, papers, clusters) {
  const result = await askLLMJSON(
    SYSTEM_PROMPT,
    buildUserPrompt(topic, papers, clusters),
    6000
  );

  const paperByExternalId = new Map(papers.map((p) => [p.externalId, p]));
  const clusterPaperCounts = new Map(clusters.map((c) => [c.name, c.paperCount]));

  const comparisonTable = (result.comparisonTable || [])
    .map((row) => {
      const paper = paperByExternalId.get(row.id);
      if (!paper) return null;
      return {
        paperId: paper._id,
        title: paper.title,
        year: paper.year,
        cluster: paper.cluster,
        citationCount: paper.citationCount,
        keyContribution: row.keyContribution,
      };
    })
    .filter(Boolean);

  const relatedWork = (result.relatedWork || []).map((rw) => ({
    cluster: rw.cluster,
    summary: rw.summary,
    paperCount: clusterPaperCounts.get(rw.cluster) || 0,
  }));

  return {
    introduction: result.introduction || "",
    relatedWork,
    trends: result.trends || "",
    comparisonTable,
    generatedAt: new Date(),
  };
}
