import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createSessionLimiter } from "../middleware/rateLimiters.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import {
  startResearch,
  getSession,
  getSessionPapers,
  listSessions,
} from "../controllers/researchController.js";

const router = Router();

router.post("/", createSessionLimiter, asyncHandler(startResearch));
router.get("/", asyncHandler(listSessions));
router.get("/:id", validateObjectIdParam("id"), asyncHandler(getSession));
router.get("/:id/papers", validateObjectIdParam("id"), asyncHandler(getSessionPapers));

export default router;
