const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const LETTERS = "ABCDEFGHIJ";

export function sectionNumber(i) {
  return ROMAN[i] || String(i + 1);
}

export function subsectionLetter(i) {
  return LETTERS[i] || String(i + 1);
}

export function draftFilename(draft, extension) {
  const slug = (draft.title || "research-paper")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug}.${extension}`;
}

export function downloadFile(filename, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function draftToMarkdown(draft) {
  const lines = [`# ${draft.title}`, ""];
  if (draft.authors) lines.push(`*${draft.authors}*  `);
  if (draft.affiliation) lines.push(`*${draft.affiliation}*`);
  lines.push("", `**Abstract—**${draft.abstract}`, "");
  if (draft.indexTerms?.length) lines.push(`**Index Terms—**${draft.indexTerms.join(", ")}`, "");

  draft.sections.forEach((section, i) => {
    lines.push(`## ${sectionNumber(i)}. ${section.heading}`, "", ...section.paragraphs.flatMap((p) => [p, ""]));
    section.subsections?.forEach((sub, j) => {
      lines.push(`### ${subsectionLetter(j)}. ${sub.heading}`, "", ...sub.paragraphs.flatMap((p) => [p, ""]));
    });
  });

  lines.push("## References", "", ...draft.references.flatMap((r) => [`[${r.ref}] ${r.text}`, ""]));
  return lines.join("\n");
}

function escapeLatex(text) {
  return (text || "")
    .replace(/\\/g, "\u0000")
    .replace(/([{}$&#_%])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}")
    .replace(/"([^"]*)"/g, "``$1''");
}

/** Escapes prose and turns "[3], [7]" into "\cite{ref3,ref7}". */
function latexProse(text) {
  let out = escapeLatex(text).replace(/\[(\d+)\]/g, "\\cite{ref$1}");
  let previous;
  do {
    previous = out;
    out = out.replace(/\\cite\{([^}]*)\},\s*\\cite\{([^}]*)\}/g, "\\cite{$1,$2}");
  } while (out !== previous);
  return out;
}

function latexReference(text) {
  const [body, url] = text.split(" [Online]. Available: ");
  return url ? `${escapeLatex(body)} [Online]. Available: \\url{${url}}` : escapeLatex(body);
}

export function draftToLatex(draft) {
  const paragraphs = (list) => list.map(latexProse).join("\n\n");
  const body = draft.sections
    .map((section) => {
      const subs = (section.subsections || [])
        .map((sub) => `\\subsection{${escapeLatex(sub.heading)}}\n${paragraphs(sub.paragraphs)}`)
        .join("\n\n");
      return [`\\section{${escapeLatex(section.heading)}}`, paragraphs(section.paragraphs), subs]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const bibliography = draft.references
    .map((r) => `\\bibitem{ref${r.ref}} ${latexReference(r.text)}`)
    .join("\n");

  return `\\documentclass[conference]{IEEEtran}
\\usepackage[T1]{fontenc}
\\usepackage{cite}
\\usepackage{url}

\\begin{document}

\\title{${escapeLatex(draft.title)}}

\\author{\\IEEEauthorblockN{${escapeLatex(draft.authors || "Author Name")}}
\\IEEEauthorblockA{\\textit{${escapeLatex(draft.affiliation || "Department, Institution")}}}}

\\maketitle

\\begin{abstract}
${escapeLatex(draft.abstract)}
\\end{abstract}

\\begin{IEEEkeywords}
${escapeLatex((draft.indexTerms || []).join(", "))}
\\end{IEEEkeywords}

${body}

\\begin{thebibliography}{${draft.references.length}}
${bibliography}
\\end{thebibliography}

\\end{document}
`;
}
