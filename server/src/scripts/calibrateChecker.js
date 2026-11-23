/**
 * Calibrates the plagiarism & AI-content checker and measures how well it works.
 *
 *   npm run calibrate-checker            (from server/; needs GEMINI_API_KEY)
 *
 * 1. Human text: arXiv abstracts submitted 2015-2020 (before LLM writing tools were common),
 *    sampled across 12 fields.
 * 2. AI text: Gemini writes an abstract for each of the same titles (two prompt styles).
 * 3. Fits the AI detector (logistic regression on stylometric features) on a 70% split, picks the
 *    strict "Likely AI" cut-off on training data, and reports metrics on the held-out 30%.
 * 4. Out-of-distribution test: human abstracts from 4 fields not used in training, and AI text
 *    from different prompts (non-native style, AI-rewritten human abstracts, informal summaries).
 * 5. Paraphrase threshold: Gemini paraphrases human abstracts; picks the MiniLM cosine threshold
 *    that keeps false matches against a realistic pool of unrelated sentences at <= 2%.
 *
 * Writes src/checker/calibration.json (committed). Raw texts are cached per step in
 * .calibration-cache/ (gitignored), so an interrupted or repeated run skips finished steps.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import { askLLM } from "../services/llmService.js";
import { embedTexts, cosineSimilarity } from "../services/embeddingService.js";
import { splitSentences, wordCount, words, ngrams } from "../checker/textProcessing.js";
import { computeDocumentFeatures, applyLogistic, FEATURES } from "../checker/aiDetection.js";
import { env } from "../config/env.js";

const CATEGORIES = [
  "cs.CL", "cs.CV", "cs.LG", "cs.RO", "cs.HC", "eess.SP",
  "q-bio.NC", "physics.med-ph", "econ.EM", "astro-ph.IM", "cond-mat.mtrl-sci", "math.OC",
];
const OOD_CATEGORIES = ["cs.CR", "stat.ME", "q-fin.ST", "cs.SE"]; // never seen in training
const PER_CATEGORY = 8;
const OOD_PER_CATEGORY = 6;
const PARAPHRASE_COUNT = 30;
const CACHE_DIR = fileURLToPath(new URL("../../.calibration-cache/", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../checker/calibration.json", import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[calibrate]`, ...a);
const round = (n) => Math.round(n * 10000) / 10000;

// Deterministic PRNG so the train/test split is reproducible.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

async function fetchHumanAbstracts(categories, perCategory) {
  const docs = [];
  for (const category of categories) {
    const { data } = await axios.get("http://export.arxiv.org/api/query", {
      params: {
        search_query: `cat:${category} AND submittedDate:[201501010000 TO 202012312359]`,
        start: 0,
        max_results: perCategory * 3,
        sortBy: "relevance",
      },
      timeout: 30000,
    });
    const parsed = await parseStringPromise(data, { explicitArray: false });
    const picked = []
      .concat(parsed.feed.entry || [])
      .map((e) => ({
        category,
        title: e.title.replace(/\s+/g, " ").trim(),
        text: e.summary.replace(/\s+/g, " ").trim(),
      }))
      .filter((d) => wordCount(d.text) >= 90 && wordCount(d.text) <= 320 && !/\$/.test(d.text)) // skip LaTeX-heavy
      .slice(0, perCategory);
    docs.push(...picked);
    log(`${category}: ${picked.length} human abstracts`);
    await sleep(3500); // arXiv asks for >= 3 s between calls
  }
  return docs;
}

/** One Gemini call; a call that still fails after llmService's retries is skipped, not fatal. */
async function tryAsk(system, prompt, maxTokens) {
  try {
    return (await askLLM(system, prompt, maxTokens)).replace(/\s+/g, " ").trim();
  } catch (err) {
    log(`skipped one generation: ${err.message.slice(0, 80)}`);
    return "";
  }
}

const AI_PROMPTS = [
  (d) => `Write the abstract for a research paper titled "${d.title}" (arXiv category ${d.category}). 150-250 words, one paragraph, plain text only.`,
  (d) => `You are a researcher. Draft a concise, publication-ready abstract for your paper "${d.title}". Plain text, about 180 words, no title or headings.`,
];

// Deliberately different from training prompts, including the hard cases for any detector.
const OOD_PROMPTS = {
  nonNative: (d) => `Write a research abstract for the paper "${d.title}" the way a non-native English PhD student would: simple words, some short sentences. About 170 words, plain text.`,
  rewriteHuman: (d) => `Rewrite the following abstract in your own words, keeping all facts. Plain text only.\n\n${d.text}`,
  informal: (d) => `Write a short, informal one-paragraph summary of a paper called "${d.title}" for a conference poster. About 150 words, plain text.`,
};

async function generateAi(humanDocs, promptFor, label) {
  const docs = [];
  for (const [i, d] of humanDocs.entries()) {
    const { name, prompt } = promptFor(d, i);
    const text = await tryAsk("You write academic text.", prompt, 700);
    if (wordCount(text) >= 60) docs.push({ category: d.category, title: d.title, prompt: name, text });
    if ((i + 1) % 10 === 0) log(`${label}: ${i + 1}/${humanDocs.length}`);
    await sleep(4500); // stay under the free tier's requests-per-minute limit
  }
  return docs;
}

async function generateParaphrases(humanDocs) {
  const pairs = [];
  for (const d of humanDocs.slice(0, PARAPHRASE_COUNT)) {
    const paraphrase = await tryAsk(
      "You rewrite text.",
      `Paraphrase this abstract sentence by sentence. Change the wording and sentence structure substantially, keep the meaning. Plain text only.\n\n${d.text}`,
      700
    );
    if (wordCount(paraphrase) >= 40) pairs.push({ category: d.category, original: d.text, paraphrase });
    await sleep(4500);
  }
  return pairs;
}

/** Each collection step is cached separately, so an interrupted run resumes where it stopped. */
async function cached(name, build) {
  const file = `${CACHE_DIR}${name}.json`;
  if (existsSync(file)) {
    log(`Using cached ${name}`);
    return JSON.parse(readFileSync(file, "utf8"));
  }
  const value = await build();
  writeFileSync(file, JSON.stringify(value, null, 1));
  return value;
}

async function loadOrBuildDataset() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const legacy = `${CACHE_DIR}dataset.json`; // single-file cache written by the first version of this script
  const base = existsSync(legacy)
    ? JSON.parse(readFileSync(legacy, "utf8"))
    : await (async () => {
        const human = await cached("human", () => fetchHumanAbstracts(CATEGORIES, PER_CATEGORY));
        const ai = await cached("ai", () =>
          generateAi(human, (d, i) => ({ name: `train-${i % 2}`, prompt: AI_PROMPTS[i % 2](d) }), "AI abstracts")
        );
        const paraphrases = await cached("paraphrases", () => generateParaphrases(human));
        return { model: env.geminiModel, human, ai, paraphrases };
      })();

  const oodHuman = await cached("ood-human", () => fetchHumanAbstracts(OOD_CATEGORIES, OOD_PER_CATEGORY));
  const promptNames = Object.keys(OOD_PROMPTS);
  const oodAi = await cached("ood-ai", () =>
    generateAi(oodHuman, (d, i) => ({ name: promptNames[i % 3], prompt: OOD_PROMPTS[promptNames[i % 3]](d) }), "OOD AI texts")
  );
  return { ...base, model: base.model || env.geminiModel, oodHuman, oodAi };
}

function standardizer(rows, names) {
  const means = {};
  const stds = {};
  for (const n of names) {
    const vals = rows.map((r) => r[n]);
    means[n] = vals.reduce((a, b) => a + b, 0) / vals.length;
    stds[n] = Math.sqrt(vals.reduce((a, b) => a + (b - means[n]) ** 2, 0) / vals.length) || 1;
  }
  return { means, stds };
}

/** Batch gradient-descent logistic regression with L2, on standardized features. */
function fitLogistic(rows, labels, names) {
  const { means, stds } = standardizer(rows, names);
  const X = rows.map((r) => names.map((n) => (r[n] - means[n]) / stds[n]));
  const w = names.map(() => 0);
  let b = 0;
  const lr = 0.1;
  const l2 = 0.01; // 12 features on ~130 samples — keep weights small to limit overfitting
  for (let iter = 0; iter < 4000; iter++) {
    const gw = names.map(() => 0);
    let gb = 0;
    X.forEach((x, i) => {
      const p = 1 / (1 + Math.exp(-(b + x.reduce((s, v, j) => s + v * w[j], 0))));
      const err = p - labels[i];
      x.forEach((v, j) => (gw[j] += err * v));
      gb += err;
    });
    names.forEach((_, j) => (w[j] -= lr * (gw[j] / X.length + l2 * w[j])));
    b -= lr * (gb / X.length);
  }
  return {
    features: names,
    weights: Object.fromEntries(names.map((n, j) => [n, round(w[j])])),
    bias: round(b),
    means: Object.fromEntries(names.map((n) => [n, round(means[n])])),
    stds: Object.fromEntries(names.map((n) => [n, round(stds[n])])),
  };
}

function evaluate(model, rows, labels, threshold = 0.5) {
  const probs = rows.map((r) => applyLogistic(model, r).probability);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  probs.forEach((p, i) => {
    const pred = p >= threshold ? 1 : 0;
    if (pred && labels[i]) tp++;
    else if (pred) fp++;
    else if (labels[i]) fn++;
    else tn++;
  });
  // AUC = probability a random AI sample scores above a random human sample.
  const pos = probs.filter((_, i) => labels[i]);
  const neg = probs.filter((_, i) => !labels[i]);
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return {
    samples: rows.length,
    accuracy: round((tp + tn) / rows.length),
    precision: round(tp / (tp + fp || 1)),
    recall: round(tp / (tp + fn || 1)),
    falsePositiveRate: round(fp / (fp + tn || 1)),
    auc: pos.length && neg.length ? round(wins / (pos.length * neg.length)) : null,
  };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return round(s[Math.floor(s.length / 2)]);
}

function withFeatures(docs, label) {
  return docs.map((d) => ({ ...d, label, features: computeDocumentFeatures(d.text) })).filter((d) => d.features);
}

function calibrateAiDetector(dataset) {
  const docs = [...withFeatures(dataset.human, 0), ...withFeatures(dataset.ai, 1)];

  // 70/30 split by title, so a human abstract and its AI twin land on the same side.
  const random = rng(42);
  const titles = [...new Set(docs.map((d) => d.title))].sort(() => random() - 0.5);
  const testTitles = new Set(titles.slice(0, Math.round(titles.length * 0.3)));
  const train = docs.filter((d) => !testTitles.has(d.title));
  const test = docs.filter((d) => testTitles.has(d.title));

  const model = fitLogistic(train.map((d) => d.features), train.map((d) => d.label), FEATURES);

  // At p >= 0.5 more human texts get flagged, so "Likely AI-generated" uses a stricter cut-off: the
  // lowest probability that flags at most 5% of *training* human texts — never chosen on test data.
  const trainHumanProbs = train
    .filter((d) => !d.label)
    .map((d) => applyLogistic(model, d.features).probability)
    .sort((a, b) => a - b);
  const likelyAi = round(Math.max(0.5, trainHumanProbs[Math.ceil(trainHumanProbs.length * 0.95) - 1] + 0.001));

  const rows = (set) => [set.map((d) => d.features), set.map((d) => d.label)];
  const metrics = evaluate(model, ...rows(test));
  const metricsAtLikelyAi = evaluate(model, ...rows(test), likelyAi);

  const ood = [...withFeatures(dataset.oodHuman, 0), ...withFeatures(dataset.oodAi, 1)];
  const outOfDistribution = {
    overall: evaluate(model, ...rows(ood), likelyAi),
    humanFalsePositiveRate: evaluate(model, ...rows(ood.filter((d) => !d.label)), likelyAi).falsePositiveRate,
    recallByPrompt: Object.fromEntries(
      Object.keys(OOD_PROMPTS).map((name) => {
        const set = ood.filter((d) => d.prompt === name);
        return [name, set.length ? evaluate(model, ...rows(set), likelyAi).recall : null];
      })
    ),
  };

  const typical = Object.fromEntries(
    FEATURES.map((n) => [
      n,
      {
        human: median(docs.filter((d) => !d.label).map((d) => d.features[n])),
        ai: median(docs.filter((d) => d.label).map((d) => d.features[n])),
      },
    ])
  );

  log("Held-out @0.5:", metrics);
  log(`Held-out @${likelyAi}:`, metricsAtLikelyAi);
  log("Out-of-distribution:", JSON.stringify(outOfDistribution));
  return {
    aiDocument: {
      ...model,
      thresholds: { likelyAi, uncertain: 0.5 },
      metrics,
      metricsAtLikelyAi,
      outOfDistribution,
      typical,
      trainSamples: train.length,
    },
  };
}

function trigramContainment(a, b) {
  const ta = ngrams(words(a), 3);
  const tb = new Set(ngrams(words(b), 3));
  return ta.length ? ta.filter((t) => tb.has(t)).length / ta.length : 0;
}

async function calibrateParaphrase(dataset) {
  const pairs = dataset.paraphrases.map((p) => ({
    ...p,
    origSentences: splitSentences(p.original),
    paraSentences: splitSentences(p.paraphrase),
  }));
  // Negative pool: every sentence of every *other* human abstract (~700 sentences, its own field
  // included). A live check compares each sentence with roughly this many candidate sentences, and
  // the best score among unrelated sentences grows with pool size, so the pool must be realistic.
  const pool = dataset.human.flatMap((d) => splitSentences(d.text).map((text) => ({ text, original: d.text })));
  const flat = [...pairs.flatMap((p) => [...p.origSentences, ...p.paraSentences]), ...pool.map((s) => s.text)];
  log(`Embedding ${flat.length} sentences for the paraphrase threshold...`);
  const vectors = await embedTexts(flat);
  let k = 0;
  for (const p of pairs) {
    p.origVecs = p.origSentences.map(() => vectors[k++]);
    p.paraVecs = p.paraSentences.map(() => vectors[k++]);
  }
  pool.forEach((s) => (s.vec = vectors[k++]));

  const positives = [];
  const negatives = [];
  const lexicalOnParaphrases = [];
  for (const p of pairs) {
    const unrelated = pool.filter((s) => s.original !== p.original);
    p.origVecs.forEach((v, i) => {
      positives.push(Math.max(...p.paraVecs.map((u) => cosineSimilarity(v, u))));
      negatives.push(Math.max(...unrelated.map((s) => cosineSimilarity(v, s.vec))));
      lexicalOnParaphrases.push(Math.max(...p.paraSentences.map((s) => trigramContainment(p.origSentences[i], s))));
    });
  }

  // Lowest threshold whose false-match rate against the unrelated pool is <= 2%.
  const sortedNeg = [...negatives].sort((a, b) => a - b);
  const threshold = round(sortedNeg[Math.floor(sortedNeg.length * 0.98)] + 0.005);
  const metrics = {
    sentencePairs: positives.length,
    recall: round(positives.filter((s) => s >= threshold).length / positives.length),
    falseMatchRate: round(negatives.filter((s) => s >= threshold).length / negatives.length),
    lexicalOnlyRecall: round(lexicalOnParaphrases.filter((c) => c >= 0.5).length / lexicalOnParaphrases.length),
    medianParaphraseSimilarity: median(positives),
    medianUnrelatedSimilarity: median(negatives),
  };
  log("Paraphrase threshold", threshold, metrics);
  return { threshold, exactContainment: 0.5, metrics };
}

async function main() {
  const dataset = await loadOrBuildDataset();
  log(
    `Dataset: ${dataset.human.length} human, ${dataset.ai.length} AI, ${dataset.paraphrases.length} paraphrase pairs; ` +
      `OOD ${dataset.oodHuman.length} human, ${dataset.oodAi.length} AI`
  );
  const ai = calibrateAiDetector(dataset);
  const paraphrase = await calibrateParaphrase(dataset);

  const calibration = {
    calibratedAt: new Date().toISOString(),
    embeddingModel: "Xenova/all-MiniLM-L6-v2",
    dataset: {
      human: `${dataset.human.length} arXiv abstracts submitted 2015-2020 across ${CATEGORIES.length} fields`,
      ai: `${dataset.ai.length} abstracts written by ${dataset.model} for the same titles`,
      outOfDistribution: `${dataset.oodHuman.length} human abstracts from ${OOD_CATEGORIES.join(", ")} + ${dataset.oodAi.length} AI texts from 3 unseen prompt styles`,
      paraphrases: `${dataset.paraphrases.length} human abstracts paraphrased by ${dataset.model}`,
    },
    ...ai,
    paraphrase,
  };
  writeFileSync(OUTPUT, JSON.stringify(calibration, null, 2) + "\n");
  log("Wrote", OUTPUT);
}

main().catch((err) => {
  console.error("[calibrate] failed:", err);
  process.exit(1);
});
