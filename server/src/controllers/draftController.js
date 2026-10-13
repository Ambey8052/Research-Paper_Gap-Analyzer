import { ResearchSession } from "../models/ResearchSession.js";
import { PaperDraft } from "../models/PaperDraft.js";
import { runPaperWriter } from "../agents/paperWriterAgent.js";
import { logger } from "../utils/logger.js";

const MAX_GAPS_PER_DRAFT = 4;

function optionalText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function createDraft(req, res) {
  const session = await ResearchSession.findById(req.params.id).select("status gaps").lean();
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "completed") {
    return res.status(400).json({ error: "Wait for the research session to finish before generating a paper." });
  }

  const { gapIndexes } = req.body;
  const indexes = Array.isArray(gapIndexes) ? [...new Set(gapIndexes)] : [];
  const valid = indexes.every((i) => Number.isInteger(i) && i >= 0 && i < session.gaps.length);
  if (indexes.length === 0 || !valid) {
    return res.status(400).json({ error: "Select at least one research gap." });
  }
  if (indexes.length > MAX_GAPS_PER_DRAFT) {
    return res.status(400).json({ error: `Select at most ${MAX_GAPS_PER_DRAFT} gaps for one paper.` });
  }

  // Gaps are stored sorted by RGCS, so ascending index = primary (highest-scoring) gap first.
  indexes.sort((a, b) => a - b);

  const draft = await PaperDraft.create({
    sessionId: session._id,
    gapIndexes: indexes,
    gapTitles: indexes.map((i) => session.gaps[i].title),
    authors: optionalText(req.body.authors, 300),
    affiliation: optionalText(req.body.affiliation, 300),
  });

  // Fire-and-forget like the main pipeline; the client polls GET .../drafts/:draftId.
  runPaperWriter(draft._id).catch((err) => {
    logger.error(`Unhandled paper writer error for draft ${draft._id}: ${err.message}`);
  });

  res.status(201).json({ draftId: draft._id });
}

export async function listDrafts(req, res) {
  const drafts = await PaperDraft.find({ sessionId: req.params.id })
    .select("title status progressMessage gapTitles createdAt")
    .sort({ createdAt: -1 })
    .lean();
  res.json(drafts);
}

export async function getDraft(req, res) {
  const draft = await PaperDraft.findOne({ _id: req.params.draftId, sessionId: req.params.id }).lean();
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  res.json(draft);
}

export async function deleteDraft(req, res) {
  const draft = await PaperDraft.findOneAndDelete({ _id: req.params.draftId, sessionId: req.params.id });
  if (!draft) return res.status(404).json({ error: "Draft not found" });
  res.status(204).send();
}
