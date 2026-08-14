import mongoose from "mongoose";

const paperSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResearchSession",
      required: true,
      index: true,
    },
    externalId: { type: String, required: true }, // arXiv id or Semantic Scholar paperId
    source: { type: String, enum: ["arxiv", "semanticscholar"], required: true },
    title: { type: String, required: true },
    abstract: { type: String, default: "" },
    authors: [{ type: String }],
    year: { type: Number },
    doi: { type: String },
    url: { type: String },
    citationCount: { type: Number, default: 0 },

    // Populated by Agent 2 (Classifier)
    topics: [{ type: String }],
    cluster: { type: String },

    // Populated by the embedding service for RAG / similarity
    embedding: { type: [Number], default: undefined },
  },
  { timestamps: true }
);

paperSchema.index({ sessionId: 1, externalId: 1 }, { unique: true });

export const Paper = mongoose.model("Paper", paperSchema);
