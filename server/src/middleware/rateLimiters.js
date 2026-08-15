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
