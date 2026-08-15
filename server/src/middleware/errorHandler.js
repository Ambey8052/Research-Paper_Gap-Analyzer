import { logger } from "../utils/logger.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, _next) {
  logger.error(`${req.method} ${req.originalUrl} -> ${err.stack || err.message}`);

  const status = err.statusCode || 500;
  // Only errors deliberately thrown with a statusCode (client-facing validation, e.g. a
  // 400) get their message shown publicly. Unexpected 500s could be anything — a Mongoose
  // CastError, a driver timeout, whatever — and might contain internal detail, so the
  // client gets a generic message while the real one goes to the server log above.
  const publicMessage = err.statusCode ? err.message : "Internal server error";
  res.status(status).json({ error: publicMessage });
}
