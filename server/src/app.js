import express from "express";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env.js";
import researchRoutes from "./routes/researchRoutes.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api/research", researchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
