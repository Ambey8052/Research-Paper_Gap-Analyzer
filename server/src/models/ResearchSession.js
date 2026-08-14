import mongoose from "mongoose";

const PIPELINE_STEPS = ["paper_finder", "classifier", "literature_review", "gap_detector"];

const stepStatusSchema = new mongoose.Schema(
  {
    step: { type: String, enum: PIPELINE_STEPS, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    message: { type: String, default: "" },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { _id: false }
);

const gapSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    relatedClusters: [{ type: String }],
    supportingPaperIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Paper" }],
    rationale: { type: String },
    scoreBreakdown: {
      sparsityScore: Number,
      recencyScore: Number,
      citationTrendScore: Number,
      llmNoveltyScore: Number,
    },
    rgcs: { type: Number, min: 0, max: 100, required: true },
  },
  { _id: false }
);

const comparisonRowSchema = new mongoose.Schema(
  {
    paperId: { type: mongoose.Schema.Types.ObjectId, ref: "Paper" },
    title: String,
    year: Number,
    cluster: String,
    citationCount: Number,
    keyContribution: String,
  },
  { _id: false }
);

const literatureReviewSchema = new mongoose.Schema(
  {
    introduction: { type: String, default: "" },
    relatedWork: [
      {
        cluster: String,
        summary: String,
        paperCount: Number,
      },
    ],
    trends: { type: String, default: "" },
    comparisonTable: [comparisonRowSchema],
    generatedAt: { type: Date },
  },
  { _id: false }
);

const researchSessionSchema = new mongoose.Schema(
  {
    topic: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    errorMessage: { type: String },
    steps: {
      type: [stepStatusSchema],
      default: PIPELINE_STEPS.map((step) => ({ step, status: "pending" })),
    },
    paperCount: { type: Number, default: 0 },
    clusters: [{ name: String, paperCount: Number }],
    literatureReview: { type: literatureReviewSchema, default: () => ({}) },
    gaps: [gapSchema],
  },
  { timestamps: true }
);

export const PIPELINE_STEP_NAMES = PIPELINE_STEPS;
export const ResearchSession = mongoose.model("ResearchSession", researchSessionSchema);
