import { askLLMJSON } from "../services/llmService.js";
import { ResearchSession } from "../models/ResearchSession.js";
import { Paper } from "../models/Paper.js";
import { PaperDraft } from "../models/PaperDraft.js";
import {
  createCitationRenumberer,
  buildReferenceList,
  formatPaperListForPrompt,
  stripCitations,
} from "../utils/citations.js";
import { buildSourceIndex, findOverlaps } from "../utils/originality.js";
import { logger } from "../utils/logger.js";

/**
 * Section template of an IEEE conference *proposal* paper. No experiments have been run when
 * a draft is generated, so — like a framework paper that defines its evaluation protocol before
 * results exist — it proposes an approach and an evaluation plan instead of reporting results.
 */
const SECTIONS = [
  {
    key: "introduction",
    heading: "Introduction",
    words: "450-650",
    subsections: "none",
    guidance:
      "Motivate the problem and why it matters in practice, summarize the state of the art with citations, " +
      "state the specific gap this paper addresses, then close with one paragraph listing the contributions in " +
      'prose ("The contributions of this paper are threefold. First, ... Second, ...") and one sentence on how ' +
      "the rest of the paper is organized.",
  },
  {
    key: "relatedWork",
    heading: "Related Work",
    words: "600-900",
    subsections: "required",
    guidance:
      "Organize prior work into 2-4 thematic subsections with short noun-phrase headings. Compare and contrast " +
      "approaches instead of summarizing papers one at a time. End each subsection by stating what that line of " +
      "work leaves open and how the proposed work differs.",
  },
  {
    key: "researchGap",
    heading: "Research Gap",
    words: "300-450",
    subsections: "none",
    guidance:
      "State precisely what is missing, grounded in the corpus facts and the closest existing work. Explain why " +
      "each limitation matters and why it is a genuine gap rather than a mere absence of papers. Present the " +
      "selected gaps as one coherent problem statement and end with the research question(s) the paper pursues.",
  },
  {
    key: "proposedApproach",
    heading: "Proposed Approach",
    words: "600-900",
    subsections: "optional",
    guidance:
      "Describe the proposed framework or method: its components, data flow, and how each part addresses the " +
      "gap. 2-4 subsections such as System Overview or Model Design are appropriate. Notation or a formula may be " +
      "written in plain text if it clarifies the design. Do not claim it has already been implemented or tested.",
  },
  {
    key: "evaluation",
    heading: "Evaluation Protocol",
    words: "500-750",
    subsections: "optional",
    guidance:
      "Define how the approach will be evaluated before any results exist: research questions (RQ1, RQ2, ...), " +
      "data or benchmarks (name a real public dataset only if you are certain it exists and fits; otherwise " +
      "describe the data required), baselines, metrics, and an ablation plan. Include a threats-to-validity " +
      "paragraph (internal, construct, external validity). State explicitly that no improvement is assumed in advance.",
  },
  {
    key: "discussion",
    heading: "Discussion and Limitations",
    words: "300-450",
    subsections: "none",
    guidance:
      "Discuss the practical strengths and the honest limitations of the proposal, including risks, scope " +
      "boundaries, and any ethical or deployment considerations relevant to the topic.",
  },
  {
    key: "conclusion",
    heading: "Conclusion and Future Work",
    words: "200-300",
    subsections: "none",
    guidance:
      "Summarize the problem, the proposed approach, and the evaluation plan, then outline future work. " +
      "Introduce no new claims.",
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const WRITING_RULES = `You are an experienced academic author writing an IEEE conference paper
(numbered sections, numeric citations such as [3], formal academic English).

Rules — follow all of them:
1. Original wording only. Never copy phrases from the provided titles or abstracts; paraphrase,
   compare, and synthesize across papers in your own words.
2. Cite every statement about prior work with the paper's number from the list, e.g. [4] or
   [2], [7]. Cite only listed numbers. Never write placeholders such as [ref] or [citation
   needed], never cite by author name and year alone, and never invent papers, authors,
   datasets, or statistics.
3. This is a proposal paper: no experiments have been run. Do not report results, accuracy
   figures, percentage improvements, or user-study findings. Describe what will be measured and
   how; expected outcomes may be stated only as hypotheses.
4. Claim only what the paper actually supports. The abstract and conclusion must match the body.
5. Correct grammar and precise, formal English. Prefer clear active sentences; "we" is fine.
   No marketing language ("revolutionary", "cutting-edge", "game-changing").
6. Plain text only: no Markdown, no bullet lists, no tables, no headings inside paragraphs.
   Each paragraph is one string in the array.
7. Stay consistent with the outline: same title, terminology, and contributions. Do not repeat
   material that belongs to another section.`;

function buildContext(session, papers, gaps) {
  const keyByPaperId = new Map(papers.map((p, i) => [String(p._id), i + 1]));
  const years = papers.map((p) => p.year).filter(Boolean);
  const themes = (session.clusters || []).map((c) => `${c.name} (${c.paperCount})`).join("; ");

  const gapText = gaps
    .map((gap, i) => {
      const keys = (gap.supportingPaperIds || [])
        .map((id) => keyByPaperId.get(String(id)))
        .filter(Boolean);
      return [
        `Gap ${i + 1}${i === 0 ? " (primary)" : ""}: ${gap.title}`,
        `  Description: ${gap.description}`,
        gap.rationale ? `  Why it is a gap: ${gap.rationale}` : null,
        gap.relatedClusters?.length ? `  Adjacent themes: ${gap.relatedClusters.join(", ")}` : null,
        `  Closest existing work: ${keys.length ? keys.map((k) => `[${k}]`).join(", ") : "none identified"} ` +
          `(${keys.length} of ${papers.length} retrieved papers directly touch it)`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `Research topic: ${session.topic}

Corpus facts (true; you may state them): ${papers.length} papers were retrieved from arXiv and
Semantic Scholar${years.length ? `, published ${Math.min(...years)}-${Math.max(...years)}` : ""}, and grouped into
${session.clusters?.length || 0} themes: ${themes}.

Selected research gap(s), primary first:
${gapText}

Papers (cite by number):
${formatPaperListForPrompt(papers, { abstractChars: 300 })}`;
}

function buildOutlinePrompt(context, gapCount) {
  const planKeys = SECTIONS.map((s) => `    "${s.key}": string`).join(",\n");
  return `${context}

Plan an IEEE conference paper that proposes research addressing the selected gap(s).
${gapCount > 1 ? "Several gaps are selected: unify them into ONE coherent research problem. The primary gap is the main focus; the others become supporting aspects. Do not produce a list of disconnected ideas.\n" : ""}
Return JSON in exactly this shape:
{
  "title": string,            // specific and descriptive, at most 20 words
  "abstract": string,         // one paragraph, 150-250 words, NO citations: context, gap, proposed approach, evaluation plan, expected contribution; no results
  "indexTerms": string[],     // 4-6 keywords
  "contributions": string[],  // 2-4 concrete contributions
  "sectionPlans": {           // 2-4 sentences each: what the section argues and which papers [n] it relies on
${planKeys}
  }
}`;
}

function buildSectionPrompt(context, outline, section, number) {
  const plans = SECTIONS.map(
    (s, i) => `${ROMAN[i]}. ${s.heading}: ${outline.sectionPlans?.[s.key] || ""}`
  ).join("\n");
  const contributions = (outline.contributions || []).map((c, i) => `${i + 1}. ${c}`).join("\n");
  const subsectionRule = {
    required: "Use 2-4 subsections. Put any short lead-in text in \"paragraphs\" (may be empty).",
    optional: "Subsections are optional; use 2-4 only if they improve structure, otherwise return [].",
    none: "Do not use subsections; return an empty array.",
  }[section.subsections];

  return `${context}

Paper outline (stay consistent with it):
Title: ${outline.title}
Abstract: ${outline.abstract}
Contributions:
${contributions}
Section plans:
${plans}

Now write Section ${ROMAN[number]}. ${section.heading}.
Plan: ${outline.sectionPlans?.[section.key] || ""}
Guidance: ${section.guidance}
Length: about ${section.words} words.
${subsectionRule}

Return JSON in exactly this shape:
{ "paragraphs": string[], "subsections": [{ "heading": string, "paragraphs": string[] }] }`;
}

/** Strips stray Markdown and splits multi-paragraph strings. */
function cleanParagraphs(paragraphs) {
  return (Array.isArray(paragraphs) ? paragraphs : [])
    .flatMap((p) => String(p || "").split(/\n\s*\n/))
    .map((p) =>
      p
        .replace(/\*\*|__|`/g, "")
        .replace(/^#+\s*/, "")
        .replace(/^\s*[-*•]\s+/, "")
        .replace(/\s*\n\s*/g, " ")
        .trim()
    )
    .filter(Boolean);
}

function normalizeSection(heading, result) {
  const section = {
    heading,
    paragraphs: cleanParagraphs(result?.paragraphs),
    subsections: (Array.isArray(result?.subsections) ? result.subsections : [])
      .map((sub) => ({
        heading: String(sub?.heading || "").replace(/^[A-Z]\.\s*/, "").trim(),
        paragraphs: cleanParagraphs(sub?.paragraphs),
      }))
      .filter((sub) => sub.heading && sub.paragraphs.length > 0),
  };
  if (section.paragraphs.length === 0 && section.subsections.length === 0) {
    throw new Error(`Gemini returned an empty "${heading}" section`);
  }
  return section;
}

function allParagraphs(section) {
  return [...section.paragraphs, ...section.subsections.flatMap((sub) => sub.paragraphs)];
}

function checkSection(section, sourceIndex) {
  const totals = { total: 0, matched: 0, passages: [] };
  for (const paragraph of allParagraphs(section)) {
    const result = findOverlaps(paragraph, sourceIndex);
    totals.total += result.total;
    totals.matched += result.matched;
    totals.passages.push(...result.passages.map((p) => ({ section: section.heading, ...p })));
  }
  return totals;
}

async function rewriteOverlaps(section, passages) {
  const phrases = passages.map((p) => `- "${p.text}"`).join("\n");
  const result = await askLLMJSON(
    WRITING_RULES,
    `The section below contains word sequences copied verbatim from source abstracts:
${phrases}

Rewrite the affected sentences in original wording with the same meaning. Keep everything
else — structure, subsection headings, citations — unchanged.

Section (JSON):
${JSON.stringify({ paragraphs: section.paragraphs, subsections: section.subsections })}

Return JSON in exactly the same shape:
{ "paragraphs": string[], "subsections": [{ "heading": string, "paragraphs": string[] }] }`,
    6000
  );
  return normalizeSection(section.heading, result);
}

/**
 * Paper Writer agent (the roadmap's "Paper Writing Assistant").
 *
 * 1. Outline call: title, abstract, index terms, contributions, and a plan per section.
 * 2. One call per section, each seeing the full outline so sections stay coherent and don't
 *    repeat each other.
 * 3. Originality pass: 8-word overlap check against every source abstract; sections with
 *    copied phrasing get one rewrite, then are re-checked.
 * 4. Citations renumbered by first appearance; reference list holds only cited papers (IEEE).
 */
export async function runPaperWriter(draftId) {
  const progress = (message) =>
    PaperDraft.updateOne({ _id: draftId }, { $set: { progressMessage: message } });

  try {
    const draft = await PaperDraft.findById(draftId);
    if (!draft) throw new Error(`Draft ${draftId} not found`);
    await PaperDraft.updateOne({ _id: draftId }, { $set: { status: "running" } });

    const session = await ResearchSession.findById(draft.sessionId).lean();
    if (!session) throw new Error("The research session for this draft no longer exists");
    const papers = await Paper.find({ sessionId: draft.sessionId }).sort({ citationCount: -1 }).lean();
    const gaps = draft.gapIndexes.map((i) => session.gaps[i]).filter(Boolean);

    const context = buildContext(session, papers, gaps);

    await progress("Planning the outline");
    const outline = await askLLMJSON(
      "You are the lead author planning an IEEE conference proposal paper. " + WRITING_RULES,
      buildOutlinePrompt(context, gaps.length),
      3000
    );
    if (!outline.title || !outline.abstract) throw new Error("Gemini returned an incomplete outline");

    const sections = [];
    for (const [i, section] of SECTIONS.entries()) {
      await progress(`Writing Section ${ROMAN[i]}. ${section.heading} (${i + 1} of ${SECTIONS.length})`);
      const result = await askLLMJSON(
        WRITING_RULES,
        buildSectionPrompt(context, outline, section, i),
        section.subsections === "none" ? 4096 : 6000
      );
      sections.push(normalizeSection(section.heading, result));
    }

    // The abstract comes from the planning call, whose attention is on structure rather than
    // prose, so it gets a dedicated proofread — it's also the part reviewers read first.
    await progress("Proofreading the abstract");
    try {
      const proofread = await askLLMJSON(
        WRITING_RULES,
        `Proofread this abstract of a proposal paper titled "${outline.title}".
Fix grammar, articles, punctuation, and awkward phrasing. Rephrase any claim of achieved results
(e.g. "establishes new baselines", "outperforms") as an aim or hypothesis, since no experiments
have been run. Keep the meaning, keep it 150-250 words, one paragraph, no citations.

Abstract: ${outline.abstract}

Return JSON: { "abstract": string }`,
        1500
      );
      if (proofread.abstract?.trim()) outline.abstract = proofread.abstract.trim();
    } catch (err) {
      logger.warn(`Abstract proofread failed for draft ${draftId}, keeping original: ${err.message}`);
    }

    await progress("Checking originality against the source abstracts");
    const sourceIndex = buildSourceIndex(papers);
    // The abstract goes through the same check/rewrite path as a pseudo-section.
    const parts = [{ heading: "Abstract", paragraphs: cleanParagraphs([outline.abstract]), subsections: [] }, ...sections];
    const rewrittenSections = [];

    for (const [i, part] of parts.entries()) {
      const check = checkSection(part, sourceIndex);
      if (check.passages.length === 0) continue;
      await progress(`Rewriting copied phrasing in ${part.heading}`);
      try {
        parts[i] = await rewriteOverlaps(part, check.passages);
        rewrittenSections.push(part.heading);
      } catch (err) {
        // A failed rewrite keeps the original text; the remaining overlap is reported below.
        logger.warn(`Originality rewrite failed for "${part.heading}" in draft ${draftId}: ${err.message}`);
      }
    }

    const finalChecks = parts.map((part) => checkSection(part, sourceIndex));
    const total = finalChecks.reduce((sum, c) => sum + c.total, 0);
    const matched = finalChecks.reduce((sum, c) => sum + c.matched, 0);

    await progress("Formatting citations and references");
    const [abstractPart, ...finalSections] = parts;
    const citations = createCitationRenumberer(papers.length);
    for (const section of finalSections) {
      section.paragraphs = section.paragraphs.map((p) => citations.rewrite(p));
      for (const sub of section.subsections) sub.paragraphs = sub.paragraphs.map((p) => citations.rewrite(p));
    }

    await PaperDraft.updateOne(
      { _id: draftId },
      {
        $set: {
          title: stripCitations(outline.title),
          abstract: stripCitations(abstractPart.paragraphs.join(" ")),
          indexTerms: (outline.indexTerms || [])
            .map((t) => String(t).trim())
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b)), // IEEE lists index terms alphabetically
          sections: finalSections,
          references: buildReferenceList(citations.orderedKeys(), papers),
          originality: {
            sourceCount: papers.length,
            overlapPercent: total ? Math.round((matched / total) * 1000) / 10 : 0,
            rewrittenSections,
            flaggedPassages: finalChecks.flatMap((c) => c.passages).slice(0, 20),
          },
          status: "completed",
          progressMessage: "Done",
        },
      }
    );
    logger.info(`Paper draft ${draftId} completed`);
  } catch (err) {
    logger.error(`Paper draft ${draftId} failed: ${err.message}`);
    await PaperDraft.updateOne(
      { _id: draftId },
      { $set: { status: "failed", errorMessage: err.message, progressMessage: "Failed" } }
    );
  }
}
