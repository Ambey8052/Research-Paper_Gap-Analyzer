import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { words, wordCount, splitSentences } from "./textProcessing.js";

/**
 * AI-content detection from explainable stylometric features, combined by a logistic regression
 * whose weights come from `npm run calibrate-checker` (scripts/calibrateChecker.js), which also
 * measures accuracy on held-out and out-of-distribution text.
 *
 * Why no language model: perplexity / top-10-token / perplexity-burstiness features from a local
 * distilgpt2 were tried first. On held-out abstracts they reached AUC 0.91 vs 1.00 for these
 * style features alone, and the model needs ~310 MB of RAM — over Render free tier's budget. The
 * "AI = low perplexity" rule comes from older generators; modern Gemini text was actually *less*
 * predictable to GPT-2 than human abstracts.
 */

export const FEATURES = [
  "sentenceLengthCV", // burstiness of sentence length
  "meanSentenceLength",
  "typeTokenRatio", // vocabulary richness, averaged over 120-word windows
  "meanWordLength",
  "longWordRate", // words of 9+ letters
  "commaRate",
  "stopwordRate", // short function words (the, of, and, ...)
  "digitRate", // concrete numbers
  "parenRate",
  "acronymRate",
  "weRate", // first-person plural
  "markerRate", // LLM-overused phrases per 100 words
];

const FUNCTION_WORDS = new Set(
  "the of and to in a is that for on with as by this are be we it from an at which or our these can its their has have was were".split(" ")
);

// Words and phrases whose frequency rose sharply in text after LLM adoption (documented in
// studies of post-2023 scientific writing). Ordinary academic words like "robust" are left out.
const AI_MARKERS = [
  "delve", "delves", "delving", "intricate", "intricacies", "underscore", "underscores",
  "underscoring", "showcase", "showcases", "showcasing", "pivotal", "realm", "tapestry",
  "multifaceted", "meticulous", "meticulously", "commendable", "garner", "garnered", "bolster",
  "bolstering", "unwavering", "testament", "seamless", "seamlessly", "ever-evolving", "noteworthy",
  "it is important to note", "it is worth noting", "plays a crucial role", "plays a pivotal role",
  "in the realm of", "a testament to", "navigating the", "in today's", "rapidly evolving landscape",
  "paving the way", "shed light on", "sheds light on", "harnessing the power",
];
const MARKER_RE = new RegExp(`\\b(${AI_MARKERS.map((m) => m.replace(/[-']/g, "[-' ]?")).join("|")})\\b`, "gi");

// In-text citations add digits/brackets that say nothing about authorship; strip them first so
// a cited paper and an uncited abstract are measured on the same footing.
const CITATION_MARKERS_RE = /\[\d+(?:\s*[,–-]\s*\d+)*\]|\([A-Z][A-Za-z'-]+(?:\s+et al\.?)?,?\s+\d{4}[a-z]?\)/g;

export function markerHits(text) {
  return (text.match(MARKER_RE) || []).map((m) => m.toLowerCase());
}

function windowedTypeTokenRatio(wordList, size = 120) {
  if (wordList.length <= size) return new Set(wordList).size / (wordList.length || 1);
  const ratios = [];
  for (let i = 0; i + size <= wordList.length; i += size) ratios.push(new Set(wordList.slice(i, i + size)).size / size);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** Document features from raw prose (used identically by calibration and live checks). */
export function computeDocumentFeatures(text) {
  const clean = text.replace(CITATION_MARKERS_RE, "");
  const sentences = splitSentences(clean);
  const wordList = words(clean);
  const n = wordList.length;
  if (n === 0 || sentences.length === 0) return null;

  const lengths = sentences.map(wordCount);
  const meanLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sdLength = Math.sqrt(lengths.reduce((a, b) => a + (b - meanLength) ** 2, 0) / lengths.length);

  return {
    sentenceLengthCV: sdLength / (meanLength || 1),
    meanSentenceLength: meanLength,
    typeTokenRatio: windowedTypeTokenRatio(wordList),
    meanWordLength: wordList.reduce((a, w) => a + w.length, 0) / n,
    longWordRate: wordList.filter((w) => w.length >= 9).length / n,
    commaRate: (clean.match(/,/g) || []).length / n,
    stopwordRate: wordList.filter((w) => FUNCTION_WORDS.has(w)).length / n,
    digitRate: (clean.match(/\d+(?:\.\d+)?/g) || []).length / n,
    parenRate: (clean.match(/\(/g) || []).length / n,
    acronymRate: (clean.match(/\b[A-Z]{2,}[a-z]?s?\b/g) || []).length / n,
    weRate: wordList.filter((w) => w === "we" || w === "our").length / n,
    markerRate: (100 * markerHits(clean).length) / n,
  };
}

const CALIBRATION_PATH = fileURLToPath(new URL("./calibration.json", import.meta.url));
let cachedCalibration = null;

/** { aiDocument, paraphrase, ... } written by scripts/calibrateChecker.js. */
export function loadCalibration() {
  if (!cachedCalibration) {
    if (!existsSync(CALIBRATION_PATH)) {
      throw new Error("The checker is not calibrated yet — run `npm run calibrate-checker` in server/");
    }
    cachedCalibration = JSON.parse(readFileSync(CALIBRATION_PATH, "utf8"));
  }
  return cachedCalibration;
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** Applies a standardized logistic model; also returns each feature's push (+ → AI-like). */
export function applyLogistic(model, features) {
  let z = model.bias;
  const contributions = {};
  for (const name of model.features) {
    const standardized = (features[name] - model.means[name]) / (model.stds[name] || 1);
    contributions[name] = model.weights[name] * standardized;
    z += contributions[name];
  }
  return { probability: sigmoid(z), contributions };
}

/**
 * "Likely AI-generated" needs the calibrated strict cut-off (chosen to flag <= 5% of human texts);
 * between 0.5 and that cut-off the honest answer is "uncertain".
 */
export function labelForProbability(p, thresholds = { likelyAi: 0.7, uncertain: 0.5 }) {
  if (p >= thresholds.likelyAi) return "Likely AI-generated";
  if (p >= thresholds.uncertain) return "Uncertain — some AI-like signals";
  return "Likely human-written";
}
