/**
 * Downloads the local embedding model into the transformers.js cache. Run at Docker build time so
 * the first pipeline run / plagiarism check after a deploy doesn't wait on the download.
 *
 * Usage: npm run prefetch-models
 */
import { pipeline } from "@huggingface/transformers";

const embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
await embedder.dispose();
console.log("Embedding model cached.");
