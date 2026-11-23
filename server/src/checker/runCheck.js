import { CheckReport } from "../models/CheckReport.js";
import { logger } from "../utils/logger.js";
import {
  normalizeWhitespace,
  stripReferenceSection,
  splitSentences,
  wordCount,
  hasCitation,
  isQuoted,
} from "./textProcessing.js";
import { runPlagiarismCheck } from "./plagiarismCheck.js";
import {
  loadCalibration,
  computeDocumentFeatures,
  applyLogistic,
  labelForProbability,
  markerHits,
} from "./aiDetection.js";

const MIN_AI_WORDS = 80;
const MIN_AI_SENTENCES = 4;

function runAiCheck(sentences, calibration) {
  // Quoted material is someone else's writing, so it says nothing about how this text was produced.
  const candidates = sentences.filter((s) => !s.quoted);
  const totalWords = candidates.reduce((sum, s) => sum + s.words, 0);
  if (totalWords < MIN_AI_WORDS || candidates.length < MIN_AI_SENTENCES) {
    return { skipped: `AI detection needs at least ${MIN_AI_WORDS} words in ${MIN_AI_SENTENCES}+ sentences.` };
  }

  const prose = candidates.map((s) => s.text).join(" ");
  const features = computeDocumentFeatures(prose);
  if (!features) return { skipped: "No readable prose to analyse." };

  const { aiDocument } = calibration;
  const { probability, contributions } = applyLogistic(aiDocument, features);

  return {
    summary: {
      probability: Math.round(probability * 1000) / 1000,
      label: labelForProbability(probability, aiDocument.thresholds),
      thresholds: aiDocument.thresholds,
      features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      contributions: Object.fromEntries(
        Object.entries(contributions).map(([k, v]) => [k, Math.round(v * 100) / 100])
      ),
      typical: aiDocument.typical,
      weights: aiDocument.weights,
      metrics: aiDocument.metricsAtLikelyAi,
      outOfDistribution: aiDocument.outOfDistribution,
      markerHits: [...new Set(markerHits(prose))],
      wordsAnalysed: totalWords,
    },
  };
}

/** Runs the requested checks on submitted text and stores the report (fire-and-forget). */
export async function runCheck(checkId, rawText) {
  const progress = (message) => CheckReport.updateOne({ _id: checkId }, { $set: { progressMessage: message } });

  try {
    const report = await CheckReport.findById(checkId).lean();
    await CheckReport.updateOne({ _id: checkId }, { $set: { status: "running" } });
    await progress("Preparing text");

    const calibration = loadCalibration();
    const { text, removed } = stripReferenceSection(normalizeWhitespace(rawText));
    const sentences = splitSentences(text).map((sentence, index) => ({
      index,
      text: sentence,
      words: wordCount(sentence),
      cited: hasCitation(sentence),
      quoted: isQuoted(sentence),
    }));
    if (sentences.length === 0) throw Object.assign(new Error("No readable sentences found in the text."), { statusCode: 400 });

    const plagiarism = report.checks.plagiarism
      ? await runPlagiarismCheck(sentences, text, calibration, progress)
      : null;
    const ai = report.checks.ai ? runAiCheck(sentences, calibration) : null;

    await CheckReport.updateOne(
      { _id: checkId },
      {
        $set: {
          wordCount: sentences.reduce((sum, s) => sum + s.words, 0),
          referencesRemoved: removed,
          sentences: sentences.map((s) => ({
            text: s.text,
            words: s.words,
            cited: s.cited,
            quoted: s.quoted,
            match: plagiarism?.sentenceMatches.get(s.index) || undefined,
          })),
          sources: plagiarism?.sources || [],
          plagiarism: plagiarism?.summary || null,
          ai: ai ? ai.summary || { skipped: ai.skipped } : null,
          status: "completed",
          progressMessage: "Done",
        },
      }
    );
    logger.info(`Check ${checkId} completed (${sentences.length} sentences)`);
  } catch (err) {
    logger.error(`Check ${checkId} failed: ${err.message}`);
    await CheckReport.updateOne(
      { _id: checkId },
      { $set: { status: "failed", errorMessage: err.message, progressMessage: "Failed" } }
    );
  }
}
