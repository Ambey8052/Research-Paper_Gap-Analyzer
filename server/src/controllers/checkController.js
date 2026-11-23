import { CheckReport } from "../models/CheckReport.js";
import { runCheck } from "../checker/runCheck.js";
import { wordCount } from "../checker/textProcessing.js";
import { logger } from "../utils/logger.js";

const MAX_CHARS = 60000; // ~10k words; bounds CPU time and the number of source searches
const MIN_WORDS = 50;

export async function createCheck(req, res) {
  const { text, title, checks } = req.body;

  if (typeof text !== "string" || wordCount(text) < MIN_WORDS) {
    return res.status(400).json({ error: `Paste or upload at least ${MIN_WORDS} words of text.` });
  }
  if (text.length > MAX_CHARS) {
    return res.status(400).json({ error: `Text is too long (max ${MAX_CHARS.toLocaleString()} characters, about 10,000 words).` });
  }
  const plagiarism = checks?.plagiarism !== false;
  const ai = checks?.ai !== false;
  if (!plagiarism && !ai) return res.status(400).json({ error: "Choose at least one check." });

  const report = await CheckReport.create({
    title: typeof title === "string" ? title.trim().slice(0, 200) : "",
    checks: { plagiarism, ai },
  });

  // The raw text is handed to the job in memory; only its split sentences get stored.
  runCheck(report._id, text).catch((err) => {
    logger.error(`Unhandled checker error for ${report._id}: ${err.message}`);
  });

  res.status(201).json({ checkId: report._id });
}

export async function getCheck(req, res) {
  const report = await CheckReport.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ error: "Report not found (reports are deleted after 7 days)." });
  res.json(report);
}

export async function deleteCheck(req, res) {
  const report = await CheckReport.findByIdAndDelete(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.status(204).send();
}
