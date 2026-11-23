import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createCheckLimiter } from "../middleware/rateLimiters.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import { createCheck, getCheck, deleteCheck } from "../controllers/checkController.js";

const router = Router();

// No list route on purpose: reports hold users' (often unpublished) text, so they're reachable by id only.
router.post("/", createCheckLimiter, asyncHandler(createCheck));
router.get("/:id", validateObjectIdParam("id"), asyncHandler(getCheck));
router.delete("/:id", validateObjectIdParam("id"), asyncHandler(deleteCheck));

export default router;
