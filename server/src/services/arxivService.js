import axios from "axios";
import { parseStringPromise } from "xml2js";
import { logger } from "../utils/logger.js";

const ARXIV_API_URL = "http://export.arxiv.org/api/query";

/**
 * Searches arXiv's Atom feed API (free, keyless) and normalizes results
 * to the shared paper shape used across all sources.
 */
export async function searchArxiv(topic, maxResults = 20) {
  try {
    const { data } = await axios.get(ARXIV_API_URL, {
      params: {
        search_query: `all:${topic}`,
        start: 0,
        max_results: maxResults,
        sortBy: "relevance",
        sortOrder: "descending",
      },
      timeout: 15000,
    });

    const parsed = await parseStringPromise(data, { explicitArray: false });
    const entries = parsed.feed.entry
      ? Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry]
      : [];

    return entries.map((entry) => {
      const arxivId = entry.id.split("/abs/").pop();
      const authors = Array.isArray(entry.author)
        ? entry.author.map((a) => a.name)
        : entry.author
        ? [entry.author.name]
        : [];

      return {
        externalId: arxivId,
        source: "arxiv",
        title: (entry.title || "").replace(/\s+/g, " ").trim(),
        abstract: (entry.summary || "").replace(/\s+/g, " ").trim(),
        authors,
        year: entry.published ? new Date(entry.published).getFullYear() : undefined,
        doi: entry["arxiv:doi"] || undefined,
        url: entry.id,
        citationCount: 0, // arXiv does not expose citation counts
      };
    });
  } catch (err) {
    logger.error(`arXiv search failed: ${err.message}`);
    return [];
  }
}
