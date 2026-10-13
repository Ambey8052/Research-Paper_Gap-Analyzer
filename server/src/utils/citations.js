/**
 * IEEE-style numeric citations.
 *
 * Agents show the LLM papers as "[1] ... [n]" (temporary keys = position in the list given to
 * the model) and ask it to cite with those numbers. IEEE numbers references in order of first
 * appearance, so the generated text is rewritten afterwards: temporary keys become final
 * reference numbers, and any number that doesn't map to a real paper is dropped — the model
 * can't cite a paper that isn't in the list (hallucination guard).
 */

// Matches "[3]", "[3, 7]", "[3-5]", "[3–5]". Each match is rewritten to canonical "[3], [7]".
const CITATION_RE = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

function expandKeys(inner) {
  const keys = [];
  for (const part of inner.split(",")) {
    const range = part.split(/[–-]/).map((n) => Number(n.trim()));
    if (range.length === 2 && range[1] >= range[0] && range[1] - range[0] < 20) {
      for (let k = range[0]; k <= range[1]; k++) keys.push(k);
    } else {
      keys.push(range[0]);
    }
  }
  return keys;
}

function tidySpacing(text) {
  return text
    .replace(/\[(?:ref|citation needed|\?)\]/gi, "") // placeholder citations are never acceptable
    .replace(/ {2,}/g, " ")
    .replace(/ +([.,;:)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/**
 * Stateful renumberer: call rewrite() on every text in document order, then
 * orderedKeys() for the reference list order.
 */
export function createCitationRenumberer(validCount) {
  const numberByKey = new Map();
  const numberFor = (key) => {
    if (!numberByKey.has(key)) numberByKey.set(key, numberByKey.size + 1);
    return numberByKey.get(key);
  };

  return {
    rewrite(text) {
      const rewritten = (text || "").replace(CITATION_RE, (_match, inner) => {
        const keys = [...new Set(expandKeys(inner))].filter((k) => k >= 1 && k <= validCount);
        const numbers = keys.map(numberFor).sort((a, b) => a - b); // IEEE: "[1], [4]" ascending
        return numbers.map((n) => `[${n}]`).join(", ");
      });
      return tidySpacing(rewritten);
    },
    /** Final number for a temporary key (assigning one if it was never cited). */
    numberFor,
    /** Temporary keys sorted by final reference number. */
    orderedKeys({ includeUncited = false } = {}) {
      if (includeUncited) for (let k = 1; k <= validCount; k++) numberFor(k);
      return [...numberByKey.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);
    },
  };
}

/** Removes every citation marker (IEEE abstracts carry no citations). */
export function stripCitations(text) {
  return tidySpacing((text || "").replace(CITATION_RE, ""));
}

function abbreviateAuthor(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts.pop();
  const initials = parts
    .map((p) => p.split("-").map((s) => `${s[0].toUpperCase()}.`).join("-"))
    .join(" ");
  return `${initials} ${last}`;
}

function formatAuthors(authors = []) {
  const names = authors.filter(Boolean).map(abbreviateAuthor);
  if (names.length === 0) return "";
  if (names.length > 6) return `${names[0]} et al.`; // IEEE: more than six authors -> et al.
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** IEEE reference text for a Paper document (without the leading "[n]"). */
export function formatIEEEReference(paper) {
  const authors = formatAuthors(paper.authors);
  const title = (paper.title || "Untitled").replace(/[.\s]+$/, "");

  const details = [];
  if (paper.source === "arxiv") {
    details.push(`arXiv:${paper.externalId.replace(/v\d+$/, "")}`);
  } else if (paper.venue) {
    details.push(paper.venue);
  }
  if (paper.volume) details.push(`vol. ${paper.volume}`);
  if (paper.pages) details.push(`pp. ${paper.pages.replace(/\s*-+\s*/, "–")}`);
  if (paper.year) details.push(String(paper.year));
  if (paper.doi) details.push(`doi: ${paper.doi}`);

  let text = `${authors ? `${authors}, ` : ""}"${title},"`;
  if (details.length > 0) text += ` ${details.join(", ")}.`;
  if (!paper.doi && paper.url) text += ` [Online]. Available: ${paper.url}`;
  return text;
}

/** Builds [{ ref, paperId, text }] from temporary keys in final order. */
export function buildReferenceList(orderedKeys, papersByKey) {
  return orderedKeys.map((key, i) => {
    const paper = papersByKey[key - 1];
    return { ref: i + 1, paperId: paper._id, text: formatIEEEReference(paper) };
  });
}

/** Lists papers for a prompt with temporary numeric keys: "[1] "Title" (2023, ...)". */
export function formatPaperListForPrompt(papers, { abstractChars = 250, withCluster = true } = {}) {
  return papers
    .map((p, i) => {
      const meta = [p.year || "n.d."];
      if (withCluster && p.cluster) meta.push(`cluster: ${p.cluster}`);
      meta.push(`citations: ${p.citationCount ?? 0}`);
      const abstract = (p.abstract || "").slice(0, abstractChars);
      return `[${i + 1}] "${p.title}" (${meta.join(", ")})${abstract ? ` — ${abstract}` : ""}`;
    })
    .join("\n");
}
