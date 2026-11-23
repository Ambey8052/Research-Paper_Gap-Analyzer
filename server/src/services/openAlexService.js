import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const OPENALEX_URL = "https://api.openalex.org/works";
const SELECT = "id,title,publication_year,abstract_inverted_index,doi,authorships,primary_location";

/** OpenAlex ships abstracts as { word: [positions] }; rebuild the plain text. */
function rebuildAbstract(inverted) {
  if (!inverted) return "";
  const slots = [];
  for (const [word, positions] of Object.entries(inverted)) for (const p of positions) slots[p] = word;
  return slots.filter(Boolean).join(" ");
}

/**
 * Searches OpenAlex (250M+ scholarly works) by relevance over title/abstract/full text.
 * Keyless use shares a tiny daily budget per IP (~100 searches), so set OPENALEX_API_KEY
 * (free, $1/day ≈ 1000 searches) in production. Returns [] on any error, like other sources.
 */
export async function searchOpenAlex(query, maxResults = 5) {
  try {
    const { data } = await axios.get(OPENALEX_URL, {
      params: {
        search: query,
        per_page: maxResults,
        select: SELECT,
        ...(env.openAlexApiKey ? { api_key: env.openAlexApiKey } : {}),
      },
      timeout: 15000,
    });

    return (data.results || [])
      .map((work) => ({
        externalId: work.id,
        source: "openalex",
        title: work.title || "Untitled",
        abstract: rebuildAbstract(work.abstract_inverted_index),
        authors: (work.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
        year: work.publication_year || undefined,
        doi: work.doi ? work.doi.replace(/^https?:\/\/doi\.org\//, "") : undefined,
        url: work.primary_location?.landing_page_url || work.doi || work.id,
        venue: work.primary_location?.source?.display_name || undefined,
      }))
      .filter((w) => w.abstract);
  } catch (err) {
    logger.error(`OpenAlex search failed: ${err.response?.status || ""} ${err.message}`);
    return [];
  }
}
