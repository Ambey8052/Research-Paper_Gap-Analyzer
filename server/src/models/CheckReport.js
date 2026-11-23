import mongoose from "mongoose";

const REPORT_TTL_SECONDS = 7 * 24 * 60 * 60; // submitted text is often unpublished work — don't keep it

// No per-sentence AI score: sentence-level detection measured ~57% accurate (see calibration.json).
const sentenceSchema = new mongoose.Schema(
  {
    text: String,
    words: Number,
    cited: Boolean,
    quoted: Boolean,
    match: {
      type: { type: String, enum: ["exact", "paraphrase"] },
      score: Number,
      sourceIndex: Number,
      sourceSentence: String,
    },
  },
  { _id: false }
);

const sourceSchema = new mongoose.Schema(
  {
    title: String,
    authors: [String],
    year: Number,
    venue: String,
    url: String,
    doi: String,
    origin: String, // openalex | arxiv | semanticscholar
    matchedWords: Number,
    matchedPercent: Number,
    matchedSentences: Number,
  },
  { _id: false }
);

/**
 * A plagiarism & AI-content check of user-submitted text. Standalone (not tied to a research
 * session) and never listed publicly — only reachable by id. Expires after 7 days.
 */
const checkReportSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    checks: { plagiarism: Boolean, ai: Boolean },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    progressMessage: { type: String, default: "Queued" },
    errorMessage: String,

    wordCount: Number,
    referencesRemoved: Boolean,
    sentences: [sentenceSchema],
    sources: [sourceSchema],
    plagiarism: { type: mongoose.Schema.Types.Mixed, default: null },
    ai: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

checkReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: REPORT_TTL_SECONDS });

export const CheckReport = mongoose.model("CheckReport", checkReportSchema);
