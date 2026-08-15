import { ResearchSession } from "../models/ResearchSession.js";
import { Paper } from "../models/Paper.js";
import { runPipeline } from "../agents/orchestrator.js";
import { logger } from "../utils/logger.js";

export async function startResearch(req, res) {
  const { topic } = req.body;

  if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
    return res.status(400).json({ error: "A research topic of at least 3 characters is required." });
  }
  if (topic.trim().length > 200) {
    return res.status(400).json({ error: "Research topic must be 200 characters or fewer." });
  }

  const session = await ResearchSession.create({ topic: topic.trim() });

  // Fire-and-forget: the pipeline runs in the background and updates the
  // session document as it progresses. The client polls GET /:id for status.
  runPipeline(session._id).catch((err) => {
    logger.error(`Unhandled pipeline error for session ${session._id}: ${err.message}`);
  });

  res.status(201).json({ sessionId: session._id });
}

export async function getSession(req, res) {
  const session = await ResearchSession.findById(req.params.id).lean();
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
}

export async function getSessionPapers(req, res) {
  const papers = await Paper.find({ sessionId: req.params.id })
    .sort({ citationCount: -1 })
    .lean();
  res.json(papers);
}

export async function listSessions(req, res) {
  const sessions = await ResearchSession.find()
    .select("topic status paperCount createdAt")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
  res.json(sessions);
}
