import { searchArxiv } from "../services/arxivService.js";
import { searchSemanticScholar } from "../services/semanticScholarService.js";
import { embedTexts } from "../services/embeddingService.js";
import { Paper } from "../models/Paper.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Merges arXiv + Semantic Scholar results, deduping by normalized title. */
function mergeResults(arxivPapers, s2Papers) {
  const byTitle = new Map();

  // Semantic Scholar first: it carries citation counts, which we prefer.
  for (const paper of [...s2Papers, ...arxivPapers]) {
    const key = normalizeTitle(paper.title);
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, paper);
  }

  return Array.from(byTitle.values());
}

/**
 * Agent 1 — Paper Finder.
 * Searches arXiv + Semantic Scholar for a topic, dedupes, embeds each
 * paper's title+abstract, and persists them to MongoDB for downstream agents.
 */
export async function runPaperFinder(sessionId, topic) {
  const perSourceLimit = Math.ceil(env.maxPapersPerSearch / 2);

  const [arxivPapers, s2Papers] = await Promise.all([
    searchArxiv(topic, perSourceLimit),
    searchSemanticScholar(topic, perSourceLimit),
  ]);

  const merged = mergeResults(arxivPapers, s2Papers).slice(0, env.maxPapersPerSearch);

  if (merged.length === 0) {
    throw new Error(
      `No papers found for topic "${topic}" on arXiv or Semantic Scholar. Try a broader query.`
    );
  }

  logger.info(`Paper Finder: ${merged.length} unique papers for "${topic}"`);

  const embeddings = await embedTexts(
    merged.map((p) => `${p.title}. ${p.abstract}`.slice(0, 1000))
  );

  const docs = merged.map((paper, i) => ({
    updateOne: {
      filter: { sessionId, externalId: paper.externalId, source: paper.source },
      update: { $set: { sessionId, ...paper, embedding: embeddings[i] } },
      upsert: true,
    },
  }));

  await Paper.bulkWrite(docs);

  return Paper.find({ sessionId }).sort({ citationCount: -1 }).lean();
}
