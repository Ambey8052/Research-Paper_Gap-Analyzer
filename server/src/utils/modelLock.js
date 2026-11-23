/**
 * Serializes use of local ONNX models so at most one is resident at a time (load → use →
 * dispose, under this lock). Render's free tier has 512 MB; a model loaded per concurrent request
 * (pipeline runs + plagiarism checks) would multiply MiniLM's ~140 MB. Reloading from the on-disk
 * cache takes under a second, so serializing costs little. (A distilgpt2 reference LM for
 * perplexity, tried for AI detection, needed ~310 MB on its own and was dropped.)
 */
let tail = Promise.resolve();

export function withModelLock(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {}); // a failed holder must not wedge everyone queued behind it
  return run;
}
