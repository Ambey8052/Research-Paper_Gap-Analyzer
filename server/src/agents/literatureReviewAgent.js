import { askLLMJSON } from "../services/llmService.js";
import {
  createCitationRenumberer,
  buildReferenceList,
  formatPaperListForPrompt,
} from "../utils/citations.js";

const SYSTEM_PROMPT = `You are a literature review writing agent. Given a clustered set of
research papers on a topic, synthesize a structured literature review section. Write in a
formal academic tone. Do NOT copy sentences from abstracts verbatim — synthesize and compare
across papers within each cluster. Be specific about what each cluster of work does and how
clusters relate to or build on each other.

Cite papers IEEE-style using their number from the list, e.g. "[4]" or "[2], [7]". Every
statement about a specific paper's work must carry its citation. Cite only numbers that appear
in the list; never write placeholders like "[ref]" and never invent papers.`;

function buildUserPrompt(topic, papers, clusters) {
  const clusterList = clusters.map((c) => `- ${c.name} (${c.paperCount} papers)`).join("\n");

  return `Research topic: ${topic}

Clusters:
${clusterList}

Papers:
${formatPaperListForPrompt(papers)}

Return JSON in exactly this shape:
{
  "introduction": string,               // 2-3 paragraphs introducing the topic and scope of this review, citing key papers
  "relatedWork": [
    { "cluster": string, "summary": string }   // 1-2 paragraphs synthesizing that cluster's papers, citing each one discussed
  ],
  "trends": string,                     // 1-2 paragraphs on cross-cluster trends and how the field is moving, with citations
  "comparisonTable": [
    { "ref": number, "keyContribution": string }  // one line per paper, its core contribution/method
  ]
}
The "ref" fields must be paper numbers from the list above. Include every cluster in
relatedWork and every paper in comparisonTable.`;
}

/**
 * Agent 3 — Literature Review.
 * Synthesizes the classified paper set into a structured review: intro,
 * per-cluster related work, cross-cluster trends, a comparison table, and an
 * IEEE reference list. Citations are renumbered by first appearance
 * (intro → related work → trends); papers never cited in the prose are
 * appended so every paper in the comparison table has a reference number.
 */
export async function runLiteratureReview(topic, papers, clusters) {
  const result = await askLLMJSON(
    SYSTEM_PROMPT,
    buildUserPrompt(topic, papers, clusters),
    6000
  );

  const clusterPaperCounts = new Map(clusters.map((c) => [c.name, c.paperCount]));
  const citations = createCitationRenumberer(papers.length);

  // Rewrite in reading order so reference numbers follow first appearance.
  const introduction = citations.rewrite(result.introduction);
  const relatedWork = (result.relatedWork || []).map((rw) => ({
    cluster: rw.cluster,
    summary: citations.rewrite(rw.summary),
    paperCount: clusterPaperCounts.get(rw.cluster) || 0,
  }));
  const trends = citations.rewrite(result.trends);

  const orderedKeys = citations.orderedKeys({ includeUncited: true });
  const references = buildReferenceList(orderedKeys, papers);

  const comparisonTable = (result.comparisonTable || [])
    .map((row) => {
      const paper = papers[Number(row.ref) - 1];
      if (!paper) return null;
      return {
        ref: citations.numberFor(Number(row.ref)),
        paperId: paper._id,
        title: paper.title,
        year: paper.year,
        cluster: paper.cluster,
        citationCount: paper.citationCount,
        keyContribution: row.keyContribution,
      };
    })
    .filter((row, i, rows) => row && rows.findIndex((r) => r?.ref === row.ref) === i)
    .sort((a, b) => a.ref - b.ref);

  return {
    introduction,
    relatedWork,
    trends,
    comparisonTable,
    references,
    generatedAt: new Date(),
  };
}
