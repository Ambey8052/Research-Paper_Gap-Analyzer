import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import researchRoutes from "./routes/researchRoutes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiters.js";

export function createApp() {
  const app = express();

  // Render (and most PaaS hosts) sit behind a reverse proxy; trusting the first hop lets
  // express-rate-limit and req.ip see the real client IP from X-Forwarded-For instead of
  // the proxy's IP, which would otherwise put every visitor in the same rate-limit bucket.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api/research", apiLimiter);
  app.use("/api/research", researchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
