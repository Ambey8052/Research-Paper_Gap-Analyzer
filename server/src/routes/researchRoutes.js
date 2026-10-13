import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSessionLimiter, createDraftLimiter } from "../middleware/rateLimiters.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  startResearch,
  getSession,
  getSessionPapers,
  listSessions,
  deleteSession,
} from "../controllers/researchController.js";
import { createDraft, listDrafts, getDraft, deleteDraft } from "../controllers/draftController.js";

const router = Router();

router.post("/", createSessionLimiter, asyncHandler(startResearch));
router.get("/", asyncHandler(listSessions));
router.get("/:id", validateObjectIdParam("id"), asyncHandler(getSession));
router.get("/:id/papers", validateObjectIdParam("id"), asyncHandler(getSessionPapers));
router.delete("/:id", validateObjectIdParam("id"), asyncHandler(deleteSession));

// Research paper drafts generated from a session's selected gaps
const validDraftIds = [validateObjectIdParam("id"), validateObjectIdParam("draftId")];
router.post("/:id/drafts", createDraftLimiter, validateObjectIdParam("id"), asyncHandler(createDraft));
router.get("/:id/drafts", validateObjectIdParam("id"), asyncHandler(listDrafts));
router.get("/:id/drafts/:draftId", ...validDraftIds, asyncHandler(getDraft));
router.delete("/:id/drafts/:draftId", ...validDraftIds, asyncHandler(deleteDraft));

export default router;
