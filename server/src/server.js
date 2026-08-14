import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

async function start() {
  await connectDB();
  const app = createApp();

  app.listen(env.port, () => {
    logger.info(`ResearchMind API listening on port ${env.port} (${env.nodeEnv})`);
  });
}

start();
