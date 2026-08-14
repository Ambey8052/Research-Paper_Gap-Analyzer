/**
 * One-off setup script: creates the Atlas Search vector index on the
 * `papers` collection. Works against a real Atlas cluster (M10+, or a free
 * tier with Search enabled) or against the mongodb-atlas-local Docker image
 * used by docker-compose for local dev.
 *
 * Usage: npm run create-vector-index   (from server/)
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

async function main() {
  await mongoose.connect(env.mongodbUri);
  const collection = mongoose.connection.collection("papers");

  const existing = await collection.listSearchIndexes(env.vectorIndexName).toArray().catch(() => []);
  if (existing.length > 0) {
    logger.info(`Vector index "${env.vectorIndexName}" already exists. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  await collection.createSearchIndex({
    name: env.vectorIndexName,
    type: "vectorSearch",
    definition: {
      fields: [
        {
          type: "vector",
          path: "embedding",
          numDimensions: 384, // Xenova/all-MiniLM-L6-v2 output size
          similarity: "cosine",
        },
        { type: "filter", path: "sessionId" },
      ],
    },
  });

  logger.info(`Created vector index "${env.vectorIndexName}" on papers.embedding.`);
  logger.info("Note: Atlas Search indexes take a few seconds to become queryable.");
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error(`Failed to create vector index: ${err.message}`);
  process.exit(1);
});
