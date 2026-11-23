import { pipeline } from "@huggingface/transformers";
import { withModelLock } from "../utils/modelLock.js";
import { logger } from "../utils/logger.js";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2"; // 384-dim, runs fully local/CPU, no API key
// Memory, measured in-process on a ~4k-word check: batches are padded to their longest text and
// attention buffers grow with length², and onnxruntime keeps a growing arena per thread — together
// that peaked at ~576 MB RSS (Render free tier: 512 MB). Hence: texts sorted by length before
// batching (little padding), small batches, ~1000-char cap (≈256 tokens, the cut-off
// sentence-transformers itself uses for this model), no arena, and two threads.
const BATCH_SIZE = 8;
const MAX_CHARS = 1000;
const SESSION_OPTIONS = { enableCpuMemArena: false, intraOpNumThreads: 2, interOpNumThreads: 1 };

/**
 * Loads the model, embeds, and disposes it again under the shared model lock (see
 * utils/modelLock.js for why models aren't kept resident).
 */
async function withExtractor(fn) {
  return withModelLock(async () => {
    const extractor = await pipeline("feature-extraction", MODEL_NAME, { session_options: SESSION_OPTIONS });
    try {
      return await fn(extractor);
    } finally {
      await extractor.dispose().catch((err) => logger.warn(`Embedding model dispose failed: ${err.message}`));
    }
  });
}

async function embedBatch(extractor, texts) {
  const output = await extractor(texts.map((t) => t.slice(0, MAX_CHARS)), { pooling: "mean", normalize: true });
  const dim = output.dims[output.dims.length - 1];
  const vectors = texts.map((_, i) => Array.from(output.data.subarray(i * dim, (i + 1) * dim)));
  output.dispose?.();
  return vectors;
}

/** Returns a normalized 384-dim embedding vector for a piece of text. */
export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

/** Embeds many texts in batches, returning one normalized vector per text. */
export async function embedTexts(texts) {
  if (texts.length === 0) return [];
  // Embed in length order (so each batch holds similar-length texts), then restore input order.
  const order = texts.map((_, i) => i).sort((a, b) => texts[a].length - texts[b].length);
  return withExtractor(async (extractor) => {
    const vectors = new Array(texts.length);
    for (let i = 0; i < order.length; i += BATCH_SIZE) {
      const batch = order.slice(i, i + BATCH_SIZE);
      const batchVectors = await embedBatch(extractor, batch.map((k) => texts[k]));
      batch.forEach((k, j) => (vectors[k] = batchVectors[j]));
    }
    return vectors;
  });
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already normalized, so dot product == cosine similarity
}
