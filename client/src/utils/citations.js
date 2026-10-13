const CITATION_RE = /\[(\d+)\]/g;

/** Turns "[3]" into a Markdown link to the matching reference anchor (for react-markdown). */
export function linkCitationsMarkdown(text, anchorPrefix) {
  return (text || "").replace(CITATION_RE, `[[$1]](#${anchorPrefix}$1)`);
}

/** Splits plain text into strings and { ref } parts so citations can render as links. */
export function splitCitations(text) {
  const parts = [];
  let last = 0;
  for (const match of (text || "").matchAll(CITATION_RE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ ref: Number(match[1]) });
    last = match.index + match[0].length;
  }
  if (last < (text || "").length) parts.push(text.slice(last));
  return parts;
}

/** Map of paperId -> reference number, from a literature review's reference list. */
export function refNumbersByPaperId(references = []) {
  return new Map(references.map((r) => [String(r.paperId), r.ref]));
}
