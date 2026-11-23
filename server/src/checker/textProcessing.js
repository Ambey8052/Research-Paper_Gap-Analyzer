/**
 * Text preprocessing shared by the plagiarism check, the AI-content detector, and the
 * detector's calibration script: reference-section stripping, sentence splitting, and
 * citation/quotation detection.
 */

const ABBREVIATIONS = [
  "et al", "e\\.g", "i\\.e", "etc", "vs", "fig", "figs", "eq", "eqs", "ref", "refs", "sec", "no",
  "vol", "pp", "dr", "prof", "mr", "mrs", "ms", "approx", "cf", "al", "resp", "dept", "univ",
];
const ABBREVIATION_RE = new RegExp(`\\b(${ABBREVIATIONS.join("|")})\\.`, "gi");
const PLACEHOLDER = "\u0001";

// Numeric "[3]", "[2, 5]", "[4]–[6]" or author-year "(Smith, 2020)", "(Smith et al., 2019a)".
const CITATION_RE = /\[\d+(?:\s*[,–-]\s*\d+)*\]|\([A-Z][A-Za-z'-]+(?:\s+(?:et al\.?|and|&)\s*[A-Z]?[A-Za-z'-]*)?,?\s+\d{4}[a-z]?(?:;[^)]*)?\)/;
const QUOTED_SPAN_RE = /["“]([^"”]{20,})["”]/g;

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being
  below between both but by can could did do does doing down during each few for from further had has
  have having he her here hers herself him himself his how i if in into is it its itself just me more
  most my myself no nor not now of off on once only or other our ours ourselves out over own same she
  should so some such than that the their theirs them themselves then there these they this those
  through to too under until up very was we were what when where which while who whom why will with
  would you your yours yourself yourselves paper propose proposed approach method methods results show
  study using based new also however thus therefore well may might one two three first second`
    .split(/\s+/)
    .filter(Boolean)
);

export function normalizeWhitespace(text) {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\w)-\n(\w)/g, "$1$2") // re-join words hyphenated across PDF line breaks
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drops everything after a final "References"/"Bibliography" heading (it isn't prose). */
export function stripReferenceSection(text) {
  const lines = text.split("\n");
  for (let i = lines.length - 1; i > lines.length * 0.3; i--) {
    if (/^\s*(?:[ivxlc]+\.\s*|\d+\.?\s*)?(references|bibliography|works cited|literature cited)\s*:?\s*$/i.test(lines[i])) {
      return { text: lines.slice(0, i).join("\n").trim(), removed: true };
    }
  }
  return { text, removed: false };
}

export function words(text) {
  return (text || "").toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}

export function wordCount(text) {
  return words(text).length;
}

/** Splits prose into sentences, protecting common academic abbreviations and decimals. */
export function splitSentences(text) {
  const protectedText = normalizeWhitespace(text)
    .replace(ABBREVIATION_RE, (m) => m.slice(0, -1) + PLACEHOLDER)
    .replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}$2`)
    .replace(/\b([A-Z])\.(?=\s?[A-Z])/g, `$1${PLACEHOLDER}`); // initials like "J. Smith"

  return protectedText
    .split(/(?<=[.!?])["”')\]]*\s+(?=["“(\[]?[A-Z0-9])|\n{2,}/)
    .map((s) => s.replaceAll(PLACEHOLDER, ".").replace(/\s*\n\s*/g, " ").trim())
    .filter((s) => wordCount(s) >= 3);
}

export function hasCitation(sentence) {
  return CITATION_RE.test(sentence);
}

/** True when most of the sentence sits inside quotation marks (quoted material is attributed). */
export function isQuoted(sentence) {
  let quotedWords = 0;
  for (const match of sentence.matchAll(QUOTED_SPAN_RE)) quotedWords += wordCount(match[1]);
  return quotedWords > 0 && quotedWords / Math.max(wordCount(sentence), 1) >= 0.5;
}

export function contentWords(text) {
  return words(text).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/** Most frequent content words — a cheap stand-in for the document's topic keywords. */
export function topKeywords(text, count = 8) {
  const freq = new Map();
  for (const w of contentWords(text)) freq.set(w, (freq.get(w) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w);
}

export function ngrams(wordList, n) {
  const result = [];
  for (let i = 0; i + n <= wordList.length; i++) result.push(wordList.slice(i, i + n).join(" "));
  return result;
}
