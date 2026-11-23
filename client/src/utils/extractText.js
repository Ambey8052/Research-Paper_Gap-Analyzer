/**
 * Extracts plain text from an uploaded file entirely in the browser — the file itself is never
 * uploaded, only the text the user then chooses to check. Parsers are loaded on demand so they
 * don't weigh down the main bundle.
 */

const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let pageText = "";
    for (const item of content.items) {
      pageText += item.str + (item.hasEOL ? "\n" : " ");
    }
    pages.push(pageText);
  }
  if (pages.join("").trim().length < 50) {
    throw new Error("This PDF has no selectable text (it may be a scanned image). Paste the text instead.");
  }
  return pages.join("\n\n");
}

async function extractDocx(file) {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const { value } = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

export async function extractTextFromFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 15 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(file);
  if (name.endsWith(".docx")) return extractDocx(file);
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".tex")) return file.text();
  throw new Error("Supported files: PDF, DOCX, TXT, MD, TEX.");
}

/** Prose of a generated paper draft (abstract + section paragraphs; no headings or references). */
export function draftToPlainText(draft) {
  const parts = [draft.abstract];
  for (const section of draft.sections) {
    parts.push(...section.paragraphs);
    for (const sub of section.subsections || []) parts.push(...sub.paragraphs);
  }
  return parts.join("\n\n");
}
