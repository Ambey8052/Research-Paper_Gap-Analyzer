import { pipeline } from "@huggingface/transformers";
import { logger } from "../utils/logger.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"; // 384-dim, runs fully local/CPU, no API key

let extractorPromise = null;

function getExtractor() {
  if (!extractorPromise) {
    logger.info(`Loading local embedding model (${MODEL_NAME})... first run downloads it.`);
    extractorPromise = pipeline("feature-extraction", MODEL_NAME);
  }
  return extractorPromise;
}

/** Returns a normalized 384-dim embedding vector for a piece of text. */
export async function embedText(text) {
  const extractor = await getExtractor();
  const output = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/** Embeds many texts sequentially (kept simple/predictable for the MVP). */
export async function embedTexts(texts) {
  const extractor = await getExtractor();
  const vectors = [];
  for (const text of texts) {
    const output = await extractor(text.slice(0, 2000), { pooling: "mean", normalize: true });
    vectors.push(Array.from(output.data));
  }
  return vectors;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already normalized, so dot product == cosine similarity
}
