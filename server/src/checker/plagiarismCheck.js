import { searchOpenAlex } from "../services/openAlexService.js";
import { searchArxiv } from "../services/arxivService.js";
import { searchSemanticScholar } from "../services/semanticScholarService.js";
import { embedTexts, cosineSimilarity } from "../services/embeddingService.js";
import { splitSentences, words, contentWords, topKeywords, ngrams } from "./textProcessing.js";

const SENTENCE_QUERIES = 7;
const MAX_SOURCES = 60;
const MIN_WORDS_TO_CHECK = 6;
const MIN_OPENALEX_RESULTS = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeTitle(title) {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * One topic query from the document's keywords plus queries from evenly spaced, long sentences
 * (their first content words). Only these short keyword strings leave the server — never the
 * full text.
 */
function buildQueries(sentences, fullText) {
  const queries = [topKeywords(fullText, 6).join(" ")];
  const candidates = sentences.filter((s) => !s.quoted && s.words >= 12);
  const step = Math.max(1, Math.floor(candidates.length / SENTENCE_QUERIES));
  for (let i = 0; i < candidates.length && queries.length <= SENTENCE_QUERIES; i += step) {
    queries.push(contentWords(candidates[i].text).slice(0, 10).join(" "));
  }
  return [...new Set(queries.filter((q) => q.split(" ").length >= 3))];
}

/**
 * OpenAlex for every query, in parallel — it indexes arXiv too and answers in ~1 s. arXiv (which
 * asks for 3 s between calls) and Semantic Scholar (whose keyless tier rate-limits hard) are only
 * a fallback for when OpenAlex comes back thin, e.g. no API key and the shared budget is spent.
 */
async function findCandidateSources(queries) {
  const openAlex = (await Promise.all(queries.map((q) => searchOpenAlex(q, 5)))).flat();

  let fallback = [];
  if (openAlex.length < MIN_OPENALEX_RESULTS) {
    const [arxiv, s2] = await Promise.all([
      (async () => {
        const results = [];
        for (const q of queries.slice(0, 3)) {
          results.push(...(await searchArxiv(q, 4)));
          await sleep(3000);
        }
        return results;
      })(),
      searchSemanticScholar(queries[0], 5),
    ]);
    fallback = [...s2, ...arxiv];
  }

  const byTitle = new Map();
  for (const source of [...openAlex, ...fallback]) {
    const key = normalizeTitle(source.title);
    if (!key || !source.abstract || byTitle.has(key)) continue;
    byTitle.set(key, { ...source, origin: source.source });
  }
  return [...byTitle.values()].slice(0, MAX_SOURCES);
}

/**
 * Checks every eligible sentence against candidate sources two ways:
 *   exact      — share of the sentence's word trigrams found in one source sentence
 *                (>= calibration.exactContainment)
 *   paraphrase — MiniLM cosine similarity to a source sentence (>= calibrated threshold),
 *                which catches rewording that shares few exact words.
 * Quoted sentences are skipped (attributed by definition); cited matches are reported but
 * counted separately from the similarity score.
 */
export async function runPlagiarismCheck(sentences, fullText, calibration, progress) {
  const { threshold: paraphraseThreshold, exactContainment } = calibration.paraphrase;

  await progress("Searching OpenAlex, arXiv and Semantic Scholar for candidate sources");
  const queries = buildQueries(sentences, fullText);
  const sources = await findCandidateSources(queries);

  const sourceSentences = sources.flatMap((source, sourceIndex) =>
    [source.title, ...splitSentences(source.abstract)].map((text) => ({ text, sourceIndex }))
  );

  const eligible = sentences.filter((s) => !s.quoted && s.words >= MIN_WORDS_TO_CHECK);
  const matches = new Map(); // sentence index -> match

  if (sources.length > 0 && eligible.length > 0) {
    await progress(`Comparing ${eligible.length} sentences against ${sources.length} sources`);

    const trigramIndex = new Map();
    sourceSentences.forEach((s, i) => {
      for (const tri of new Set(ngrams(words(s.text), 3))) {
        if (!trigramIndex.has(tri)) trigramIndex.set(tri, []);
        trigramIndex.get(tri).push(i);
      }
    });

    const vectors = await embedTexts([...eligible.map((s) => s.text), ...sourceSentences.map((s) => s.text)]);
    const sentenceVecs = vectors.slice(0, eligible.length);
    const sourceVecs = vectors.slice(eligible.length);

    eligible.forEach((sentence, k) => {
      const trigrams = [...new Set(ngrams(words(sentence.text), 3))];
      const shared = new Map();
      for (const tri of trigrams) for (const i of trigramIndex.get(tri) || []) shared.set(i, (shared.get(i) || 0) + 1);
      let lexical = { score: 0, index: -1 };
      for (const [i, count] of shared) {
        const score = count / (trigrams.length || 1);
        if (score > lexical.score) lexical = { score, index: i };
      }

      let semantic = { score: 0, index: -1 };
      sourceVecs.forEach((vec, i) => {
        const score = cosineSimilarity(sentenceVecs[k], vec);
        if (score > semantic.score) semantic = { score, index: i };
      });

      let match = null;
      if (lexical.score >= exactContainment) match = { type: "exact", ...lexical };
      else if (semantic.score >= paraphraseThreshold) match = { type: "paraphrase", ...semantic };
      if (match) {
        matches.set(sentence.index, {
          type: match.type,
          score: Math.round(match.score * 100) / 100,
          sourceIndex: sourceSentences[match.index].sourceIndex,
          sourceSentence: sourceSentences[match.index].text,
        });
      }
    });
  }

  // Sources that actually matched, ranked by matched words; renumber for the report.
  const matchedWordsBySource = new Map();
  for (const s of sentences) {
    const m = matches.get(s.index);
    if (m) matchedWordsBySource.set(m.sourceIndex, (matchedWordsBySource.get(m.sourceIndex) || 0) + s.words);
  }
  const ranked = [...matchedWordsBySource.entries()].sort((a, b) => b[1] - a[1]);
  const newIndex = new Map(ranked.map(([oldIndex], i) => [oldIndex, i]));
  const totalWords = sentences.reduce((sum, s) => sum + s.words, 0) || 1;

  const reportSources = ranked.map(([oldIndex, matchedWords]) => {
    const src = sources[oldIndex];
    return {
      title: src.title,
      authors: src.authors.slice(0, 3),
      year: src.year,
      venue: src.venue,
      url: src.url,
      doi: src.doi,
      origin: src.origin,
      matchedWords,
      matchedPercent: Math.round((1000 * matchedWords) / totalWords) / 10,
      matchedSentences: [...matches.values()].filter((m) => m.sourceIndex === oldIndex).length,
    };
  });

  const sentenceMatches = new Map(
    [...matches.entries()].map(([i, m]) => [i, { ...m, sourceIndex: newIndex.get(m.sourceIndex) }])
  );

  const sumWords = (filter) => sentences.filter(filter).reduce((sum, s) => sum + s.words, 0);
  const pct = (n) => Math.round((1000 * n) / totalWords) / 10;
  const matched = (s) => sentenceMatches.has(s.index);

  return {
    sentenceMatches,
    sources: reportSources,
    summary: {
      similarityPercent: pct(sumWords((s) => matched(s) && !s.cited)),
      exactPercent: pct(sumWords((s) => matched(s) && !s.cited && sentenceMatches.get(s.index).type === "exact")),
      paraphrasePercent: pct(sumWords((s) => matched(s) && !s.cited && sentenceMatches.get(s.index).type === "paraphrase")),
      citedMatchPercent: pct(sumWords((s) => matched(s) && s.cited)),
      quotedPercent: pct(sumWords((s) => s.quoted)),
      sourcesSearched: sources.length,
      queries: queries.length,
    },
  };
}
