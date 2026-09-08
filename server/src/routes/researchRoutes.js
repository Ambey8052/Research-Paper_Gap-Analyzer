import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSessionLimiter } from "../middleware/rateLimiters.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  startResearch,
  getSession,
  getSessionPapers,
  listSessions,
  deleteSession,
} from "../controllers/researchController.js";

const router = Router();

router.post("/", createSessionLimiter, asyncHandler(startResearch));
router.get("/", asyncHandler(listSessions));
router.get("/:id", validateObjectIdParam("id"), asyncHandler(getSession));
router.get("/:id/papers", validateObjectIdParam("id"), asyncHandler(getSessionPapers));
router.delete("/:id", validateObjectIdParam("id"), asyncHandler(deleteSession));

export default router;
