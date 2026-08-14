import { ResearchSession } from "../models/ResearchSession.js";
import { runPaperFinder } from "./paperFinderAgent.js";
import { runClassifier } from "./classifierAgent.js";
import { runLiteratureReview } from "./literatureReviewAgent.js";
import { runGapDetector } from "./gapDetectorAgent.js";
import { logger } from "../utils/logger.js";

async function setStep(sessionId, step, status, message = "") {
  const now = new Date();
  const update = {
    "steps.$[s].status": status,
    "steps.$[s].message": message,
  };
  if (status === "running") update["steps.$[s].startedAt"] = now;
  if (status === "completed" || status === "failed") update["steps.$[s].completedAt"] = now;

  await ResearchSession.updateOne(
    { _id: sessionId },
    { $set: update },
    { arrayFilters: [{ "s.step": step }] }
  );
}

/**
 * Runs Agents 1-4 sequentially against a session, persisting progress after
 * each step so the frontend can poll GET /api/research/:id and render a
 * live pipeline view.
 */
export async function runPipeline(sessionId) {
  const session = await ResearchSession.findById(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const topic = session.topic;

  // Tracks which step is actually in flight right now, so a failure can be attributed
  // to the correct step — the session document fetched above goes stale the moment the
  // first setStep() write happens, so it can't be used for that after the fact.
  let currentStep = null;

  try {
    await ResearchSession.updateOne({ _id: sessionId }, { $set: { status: "running" } });

    // Agent 1 — Paper Finder
    currentStep = "paper_finder";
    await setStep(sessionId, currentStep, "running");
    const papers = await runPaperFinder(sessionId, topic);
    await ResearchSession.updateOne({ _id: sessionId }, { $set: { paperCount: papers.length } });
    await setStep(sessionId, currentStep, "completed", `Found ${papers.length} papers`);

    // Agent 2 — Classifier
    currentStep = "classifier";
    await setStep(sessionId, currentStep, "running");
    const { papers: classifiedPapers, clusters } = await runClassifier(sessionId, topic, papers);
    await ResearchSession.updateOne({ _id: sessionId }, { $set: { clusters } });
    await setStep(sessionId, currentStep, "completed", `${clusters.length} clusters identified`);

    // Agent 3 — Literature Review
    currentStep = "literature_review";
    await setStep(sessionId, currentStep, "running");
    const literatureReview = await runLiteratureReview(topic, classifiedPapers, clusters);
    await ResearchSession.updateOne({ _id: sessionId }, { $set: { literatureReview } });
    await setStep(sessionId, currentStep, "completed");

    // Agent 4 — Gap Detector
    currentStep = "gap_detector";
    await setStep(sessionId, currentStep, "running");
    const gaps = await runGapDetector(topic, classifiedPapers, clusters);
    await ResearchSession.updateOne({ _id: sessionId }, { $set: { gaps } });
    await setStep(sessionId, currentStep, "completed", `${gaps.length} candidate gaps found`);

    await ResearchSession.updateOne({ _id: sessionId }, { $set: { status: "completed" } });
    logger.info(`Pipeline completed for session ${sessionId}`);
  } catch (err) {
    logger.error(`Pipeline failed for session ${sessionId} at step ${currentStep}: ${err.message}`);

    if (currentStep) await setStep(sessionId, currentStep, "failed", err.message);

    await ResearchSession.updateOne(
      { _id: sessionId },
      { $set: { status: "failed", errorMessage: err.message } }
    );
  }
}
