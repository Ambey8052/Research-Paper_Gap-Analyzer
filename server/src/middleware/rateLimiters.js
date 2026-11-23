import rateLimit from "express-rate-limit";

// General ceiling on all API traffic per IP.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/research triggers a real Gemini + arXiv/Semantic Scholar/MongoDB pipeline per
// call, so it gets a much tighter limit than plain reads — this is what actually protects
// the free-tier API quota and DB from being burned through by a spam loop.
export const createSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many research sessions created from this IP. Please try again later." },
});

// Each paper draft is ~9-15 sequential Gemini calls (outline, 7 sections, originality rewrites),
// so it gets the same tight per-IP budget as starting a session.
export const createDraftLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many paper drafts generated from this IP. Please try again later." },
});

// A check runs ~8 scholarly-API searches plus two local models on the CPU, so it's capped like
// the other expensive endpoints.
export const createCheckLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checks started from this IP. Please try again later." },
});
