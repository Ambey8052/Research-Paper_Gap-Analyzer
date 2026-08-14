import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const S2_API_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const FIELDS = "title,abstract,year,authors,externalIds,citationCount,url";

/**
 * Searches Semantic Scholar's free Graph API. Works without a key at low
 * rate limits; SEMANTIC_SCHOLAR_API_KEY raises those limits if set.
 */
export async function searchSemanticScholar(topic, maxResults = 20) {
  try {
    const headers = env.semanticScholarApiKey
      ? { "x-api-key": env.semanticScholarApiKey }
      : undefined;

    const { data } = await axios.get(S2_API_URL, {
      params: { query: topic, limit: maxResults, fields: FIELDS },
      headers,
      timeout: 15000,
    });

    return (data.data || []).map((paper) => ({
      externalId: paper.paperId,
      source: "semanticscholar",
      title: paper.title || "Untitled",
      abstract: paper.abstract || "",
      authors: (paper.authors || []).map((a) => a.name),
      year: paper.year || undefined,
      doi: paper.externalIds?.DOI || undefined,
      url: paper.url,
      citationCount: paper.citationCount || 0,
    }));
  } catch (err) {
    logger.error(`Semantic Scholar search failed: ${err.message}`);
    return [];
  }
}
