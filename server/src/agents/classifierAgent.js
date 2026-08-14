import { askLLMJSON } from "../services/llmService.js";
import { Paper } from "../models/Paper.js";

const SYSTEM_PROMPT = `You are a research paper classification agent inside an academic literature
review pipeline. Given a list of papers (title + abstract snippet) on a research topic, group
them into a small number of coherent sub-topic clusters (aim for 3-8 clusters depending on the
diversity of the set) and assign 1-4 short keyword tags to each paper.

Cluster names should be short, specific noun phrases (e.g. "Multi-Agent Coordination",
"Retrieval-Augmented Generation", "Clinical Diagnosis Applications") — not generic labels like
"Miscellaneous" unless a paper genuinely fits nowhere else.`;

function buildUserPrompt(topic, papers) {
  const paperList = papers
    .map(
      (p, i) =>
        `${i + 1}. [id=${p.externalId}] "${p.title}" (${p.year || "n.d."}) — ${(p.abstract || "").slice(0, 300)}`
    )
    .join("\n");

  return `Research topic: ${topic}

Papers:
${paperList}

Return JSON in exactly this shape:
{
  "clusters": [{ "name": string, "description": string }],
  "assignments": [{ "id": string, "cluster": string, "topics": string[] }]
}
The "id" field in assignments must match the [id=...] value given for each paper. Every paper
must receive exactly one "cluster" that matches a "name" in the clusters array.`;
}

/**
 * Agent 2 — Classifier.
 * Uses Gemini to group papers into sub-topic clusters and tag each with
 * keywords, so downstream agents can reason about the literature by theme
 * instead of as a flat list.
 */
export async function runClassifier(sessionId, topic, papers) {
  const result = await askLLMJSON(SYSTEM_PROMPT, buildUserPrompt(topic, papers));

  const clusters = Array.isArray(result.clusters) ? result.clusters : [];
  const assignments = Array.isArray(result.assignments) ? result.assignments : [];
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));

  const bulkOps = papers.map((paper) => {
    const assignment = assignmentById.get(paper.externalId);
    return {
      updateOne: {
        filter: { _id: paper._id },
        update: {
          $set: {
            cluster: assignment?.cluster || "Uncategorized",
            topics: assignment?.topics || [],
          },
        },
      },
    };
  });

  if (bulkOps.length > 0) await Paper.bulkWrite(bulkOps);

  const updatedPapers = await Paper.find({ sessionId }).lean();

  const clusterCounts = new Map();
  for (const paper of updatedPapers) {
    clusterCounts.set(paper.cluster, (clusterCounts.get(paper.cluster) || 0) + 1);
  }

  const clusterSummary = clusters
    .map((c) => ({ name: c.name, paperCount: clusterCounts.get(c.name) || 0 }))
    .filter((c) => c.paperCount > 0);

  return { papers: updatedPapers, clusters: clusterSummary };
}
