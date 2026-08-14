import { Paper } from "../models/Paper.js";
import { env } from "../config/env.js";
import { cosineSimilarity } from "./embeddingService.js";
import { logger } from "../utils/logger.js";

/**
 * Finds the papers most similar to a query embedding within a session.
 *
 * Tries MongoDB Atlas Vector Search ($vectorSearch) first, since that's the
 * production path (works against a real Atlas cluster or the
 * mongodb-atlas-local Docker image once `npm run create-vector-index` has
 * been run). If the index isn't present yet, it falls back to a plain
 * in-memory cosine similarity scan — session paper counts are small (tens,
 * not millions), so this is a safe, zero-setup default for local dev.
 */
export async function findSimilarPapers(sessionId, queryEmbedding, limit = 5) {
  try {
    const results = await Paper.aggregate([
      {
        $vectorSearch: {
          index: env.vectorIndexName,
          path: "embedding",
          queryVector: queryEmbedding,
          numCandidates: 200,
          limit,
          filter: { sessionId },
        },
      },
      { $set: { score: { $meta: "vectorSearchScore" } } },
    ]);

    if (results.length > 0) return results;
    throw new Error("empty result, falling back");
  } catch (err) {
    logger.warn(
      `Atlas $vectorSearch unavailable (${err.message}); using in-memory cosine similarity fallback. ` +
        "Run `npm run create-vector-index` in server/ once your Mongo deployment supports Atlas Search."
    );
    return inMemorySimilaritySearch(sessionId, queryEmbedding, limit);
  }
}

async function inMemorySimilaritySearch(sessionId, queryEmbedding, limit) {
  const papers = await Paper.find({ sessionId, embedding: { $exists: true } }).lean();
  return papers
    .map((paper) => ({ ...paper, score: cosineSimilarity(queryEmbedding, paper.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
