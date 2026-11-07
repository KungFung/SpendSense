// gemini.js — asks Google Gemini about the transactions our rules were unsure about.
//
// Promises this file keeps:
//   - PRIVACY: only description + amount of the UNSURE transactions are sent, in ONE request.
//     No dates, no balances, no names, never the whole statement. Long digit runs
//     (card numbers, references) are masked before sending.
//   - SAFETY: if there's no API key, no internet, a bad reply, anything at all,
//     we return [] and the transactions just stay "unsure". It never throws.
//   - The AI only gives a label + reason. All money maths happens in our own code.

const path = require("node:path");

// Read GEMINI_API_KEY and GEMINI_MODEL from the .env file in the repo root (if it exists).
// process.loadEnvFile is built into Node 20.12+, so we don't need the "dotenv" package.
try {
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch {
  // No .env file: fine, the AI step is just switched off.
}

const DEFAULT_MODEL = "gemini-3.8-flash";

// What we want back: a list of { id, label, confidence, reason }.
// Gemini is told to follow this JSON Schema exactly.
const RESPONSE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "integer" },
      label: { type: "string", enum: ["need", "want", "unsure"] },
      confidence: { type: "number" },
      reason: { type: "string" },
    },
    required: ["id", "label", "confidence", "reason"],
  },
};

// Hide card numbers and reference numbers (4+ digits in a row) before sending.
function maskDigits(text) {
  return String(text || "").replace(/\d{4,}/g, "####");
}

function buildPrompt(items) {
  return [
    "You help a UK budgeting app sort bank transactions into needs and wants.",
    "need = essentials (food shopping, bills, rent, travel to work, medicine).",
    "want = nice-to-haves (takeaways, treats, games, fashion, entertainment).",
    'If you genuinely cannot tell from the description, answer "unsure".',
    "Give a confidence from 0 to 1 and a short, kind reason (max 15 words).",
    "Return one entry per transaction, using the same id.",
    "",
    "Transactions (JSON):",
    JSON.stringify(items),
  ].join("\n");
}

// Check one AI answer is sensible. Anything odd is thrown away.
function cleanAnswer(answer, count) {
  if (!answer || !Number.isInteger(answer.id) || answer.id < 0 || answer.id >= count) return null;
  if (!["need", "want", "unsure"].includes(answer.label)) return null;
  const confidence = Math.min(1, Math.max(0, Number(answer.confidence) || 0));
  const reason = String(answer.reason || "").slice(0, 200);
  return { id: answer.id, label: answer.label, confidence, reason };
}

// unsureTransactions: the transactions our rules couldn't decide on.
// options.apiKey / options.model override the .env values; options.client is for tests.
async function askGeminiAboutUnsure(unsureTransactions, options = {}) {
  if (unsureTransactions.length === 0) return [];

  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey && !options.client) return []; // AI switched off: no key

  try {
    let client = options.client;
    if (!client) {
      const { GoogleGenAI } = require("@google/genai");
      client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 15000 } }); // give up after 15s
    }

    // id = position in the list, so we can match answers back. Only description + amount.
    const items = unsureTransactions.map((t, id) => ({ id, description: maskDigits(t.description), amount: t.amount }));

    const response = await client.models.generateContent({
      model: options.model || process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents: buildPrompt(items),
      config: { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0 },
    });

    const answers = JSON.parse(response.text);
    if (!Array.isArray(answers)) return [];
    return answers.map((a) => cleanAnswer(a, items.length)).filter(Boolean);
  } catch (error) {
    // Bad key, no internet, quota, weird reply... we just carry on without AI.
    console.warn(`[classifier] Gemini skipped, keeping those as "unsure": ${String(error.message).slice(0, 120)}`);
    return [];
  }
}

module.exports = { askGeminiAboutUnsure, maskDigits, buildPrompt, DEFAULT_MODEL };
