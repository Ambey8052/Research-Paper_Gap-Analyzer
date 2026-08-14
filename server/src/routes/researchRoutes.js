import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  startResearch,
  getSession,
  getSessionPapers,
  listSessions,
} from "../controllers/researchController.js";

const router = Router();

router.post("/", asyncHandler(startResearch));
router.get("/", asyncHandler(listSessions));
router.get("/:id", asyncHandler(getSession));
router.get("/:id/papers", asyncHandler(getSessionPapers));

export default router;
