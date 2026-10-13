import mongoose from "mongoose";
import { referenceSchema } from "./ResearchSession.js";

const subsectionSchema = new mongoose.Schema(
  {
    heading: { type: String, required: true },
    paragraphs: [{ type: String }],
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    heading: { type: String, required: true },
    paragraphs: [{ type: String }],
    subsections: [subsectionSchema],
  },
  { _id: false }
);

const flaggedPassageSchema = new mongoose.Schema(
  {
    section: String,
    text: String, // the overlapping word sequence
    paperTitle: String, // source abstract it matched
  },
  { _id: false }
);

/**
 * An IEEE-style research paper draft generated from one or more of a
 * session's gaps by the Paper Writer agent. Gaps have no _id, so they're
 * referenced by index into session.gaps (stable once the session completes).
 */
const paperDraftSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
      index: true,
    },
    gapIndexes: [{ type: Number }],
    gapTitles: [{ type: String }],
    authors: { type: String, default: "" },
    affiliation: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    progressMessage: { type: String, default: "Queued" },
    errorMessage: { type: String },

    title: { type: String, default: "" },
    abstract: { type: String, default: "" },
    indexTerms: [{ type: String }],
    sections: [sectionSchema],
    references: [referenceSchema],

    originality: {
      sourceCount: Number, // number of source abstracts compared against
      overlapPercent: Number, // % of the draft's 8-word sequences found in a source abstract
      rewrittenSections: [{ type: String }],
      flaggedPassages: [flaggedPassageSchema], // overlaps still present after rewriting
    },
  },
  { timestamps: true }
);

export const PaperDraft = mongoose.model("PaperDraft", paperDraftSchema);
