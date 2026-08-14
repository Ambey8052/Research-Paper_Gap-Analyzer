import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const client = new GoogleGenAI({ apiKey: env.geminiApiKey });

// Non-lite flash/pro models "think" by default, and thinking tokens are drawn from the
// same maxOutputTokens budget as the visible answer — with a tight budget that can
// silently consume the whole call and leave an empty response.text. We want fast,
// deterministic structured output here, not chain-of-thought, so thinking is disabled
// where the model supports it. Lite models have no thinking capability at all and
// reject thinkingConfig outright (400 INVALID_ARGUMENT), so it's omitted for them.
const NO_THINKING = { thinkingBudget: 0 };
const modelSupportsThinkingConfig = !env.geminiModel.includes("lite");

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const MAX_ATTEMPTS = 3;

/**
 * The free Gemini tier occasionally returns transient 429 (rate limited) or 503
 * ("model overloaded, try again later") errors under normal load. Retrying a couple of
 * times with backoff clears most of these without surfacing a failure to the user.
 */
async function generateWithRetry(request) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await client.models.generateContent(request);
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE_STATUS.has(err.status) || attempt === MAX_ATTEMPTS) throw err;
      const delayMs = 1000 * 3 ** (attempt - 1); // 1s, 3s
      logger.warn(
        `Gemini call failed with status ${err.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delayMs}ms: ${err.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/** Plain text completion from Gemini. */
export async function askLLM(systemPrompt, userPrompt, maxOutputTokens = 2048) {
  const response = await generateWithRetry({
    model: env.geminiModel,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens,
      ...(modelSupportsThinkingConfig ? { thinkingConfig: NO_THINKING } : {}),
    },
  });

  return response.text ?? "";
}

/**
 * Asks Gemini for a response and parses it as JSON. Uses Gemini's native
 * responseMimeType: "application/json" mode, and still defensively strips
 * markdown code fences in case the model wraps the answer anyway.
 */
export async function askLLMJSON(systemPrompt, userPrompt, maxOutputTokens = 4096) {
  const response = await generateWithRetry({
    model: env.geminiModel,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens,
      responseMimeType: "application/json",
      ...(modelSupportsThinkingConfig ? { thinkingConfig: NO_THINKING } : {}),
    },
  });

  const raw = response.text ?? "";
  const cleaned = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    logger.error(`Failed to parse Gemini JSON response: ${err.message}\nRaw: ${cleaned.slice(0, 500)}`);
    throw new Error("Gemini returned a response that could not be parsed as JSON");
  }
}
