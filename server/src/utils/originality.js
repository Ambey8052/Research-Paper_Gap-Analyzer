/**
 * Verbatim-overlap check between generated text and the source abstracts it was written from.
 *
 * Splits text into overlapping 8-word sequences ("shingles"). An 8-word run identical to a
 * source abstract is very unlikely to be coincidence, so any shared shingle is treated as
 * copied phrasing. This only covers the session's own sources — it is not a web-wide
 * plagiarism check (Turnitin/iThenticate), and the UI says so.
 */

const SHINGLE_SIZE = 8;

function words(text) {
  return (text || "")
    .toLowerCase()
    .replace(/\[\d+\]/g, " ") // citation markers aren't prose
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(wordList) {
  const result = [];
  for (let i = 0; i + SHINGLE_SIZE <= wordList.length; i++) {
    result.push(wordList.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return result;
}

/** Index of every source shingle -> title of the first paper it appears in. */
export function buildSourceIndex(papers) {
  const index = new Map();
  for (const paper of papers) {
    for (const shingle of shingles(words(`${paper.title}. ${paper.abstract}`))) {
      if (!index.has(shingle)) index.set(shingle, paper.title);
    }
  }
  return index;
}

/**
 * Returns { total, matched, passages } for one piece of text, where passages are maximal
 * runs of consecutive matching shingles merged back into word sequences.
 */
export function findOverlaps(text, sourceIndex) {
  const wordList = words(text);
  const textShingles = shingles(wordList);
  const passages = [];
  let matched = 0;
  let run = null;

  textShingles.forEach((shingle, i) => {
    const paperTitle = sourceIndex.get(shingle);
    if (paperTitle) {
      matched++;
      if (run && run.end === i - 1) {
        run.end = i;
      } else {
        run = { start: i, end: i, paperTitle };
        passages.push(run);
      }
    }
  });

  return {
    total: textShingles.length,
    matched,
    passages: passages.map((p) => ({
      text: wordList.slice(p.start, p.end + SHINGLE_SIZE).join(" "),
      paperTitle: p.paperTitle,
    })),
  };
}
