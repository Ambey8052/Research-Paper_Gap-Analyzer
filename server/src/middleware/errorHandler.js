import { logger } from "../utils/logger.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}
