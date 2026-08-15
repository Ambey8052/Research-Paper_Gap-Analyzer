import dotenv from "dotenv";

// override: true — this project's own server/.env must always win over any
// ANTHROPIC_API_KEY (or other var) that happens to already be set in the shell/system
// environment, otherwise a stale ambient value silently shadows the one in .env forever.
dotenv.config({ override: true });

const required = ["GEMINI_API_KEY", "MONGODB_URI"];

function loadEnv() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0 && process.env.NODE_ENV !== "test") {
    console.warn(
      `[env] Missing recommended environment variables: ${missing.join(", ")}. ` +
        "Copy server/.env.example to server/.env and fill them in."
    );
  }

  return {
    port: Number(process.env.PORT) || 5000,
    nodeEnv: process.env.NODE_ENV || "development",
    // Trailing slash stripped defensively: the CORS middleware echoes this back verbatim
    // in Access-Control-Allow-Origin, which browsers require to exactly match the
    // Origin header they send — and Origin headers never have a trailing slash.
    clientOrigin: (process.env.CLIENT_ORIGIN || "http://localhost:5173").replace(/\/+$/, ""),
    mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/researchmind",
    vectorIndexName: process.env.VECTOR_INDEX_NAME || "paper_vector_index",
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    geminiModel: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
    maxPapersPerSearch: Number(process.env.MAX_PAPERS_PER_SEARCH) || 40,
  };
}

export const env = loadEnv();
