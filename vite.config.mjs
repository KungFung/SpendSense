import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const page = (p) => fileURLToPath(new URL(`./website/${p}`, import.meta.url));
const require = createRequire(import.meta.url);

// POST /api/classify-unsure: the website sends ONLY the payments our rules were unsure about
// (description + amount, nothing else) and gets Gemini's need/want answers back.
// This runs on your computer inside `npm run dev`, so the GEMINI_API_KEY in .env never reaches
// the browser or GitHub. No key, or Gemini busy? It answers { ai: "off" | "failed" } and the
// website simply lets the user pick need or want.
function aiHelper() {
  const handle = async (req, res, next) => {
    if (req.url !== "/api/classify-unsure" || req.method !== "POST") return next();
    const reply = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200_000) return reply(413, { ai: "failed", answers: [] });
      }
      const items = (JSON.parse(raw).items || []).slice(0, 300).map((t) => ({
        description: String(t.description || "").slice(0, 200),
        amount: Number(t.amount) || 0,
      }));
      const { askGeminiAboutUnsure } = require("./src/classifier/gemini.js");
      if (!process.env.GEMINI_API_KEY) return reply(200, { ai: "off", answers: [] });
      const answers = await askGeminiAboutUnsure(items);
      reply(200, { ai: answers.length || items.length === 0 ? "ok" : "failed", answers });
    } catch (error) {
      reply(400, { ai: "failed", answers: [], error: String(error.message).slice(0, 100) });
    }
  };
  return {
    name: "pact-ai-helper",
    // Block bodies on purpose: if these returned something, Vite would call it as a second hook.
    configureServer(server) { server.middlewares.use(handle); },
    configurePreviewServer(server) { server.middlewares.use(handle); },
  };
}

// `npm run dev` serves website/ (so index.html works too) and opens the spending chart.
// The chart reads statement_withinfo.csv from the repo root (imported in website/chart.jsx).
export default defineConfig({
  root: "website",
  plugins: [react(), aiHelper()],
  server: { open: "/" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Only the chart is built. index.html loads plain scripts and is opened directly, no build needed.
    // rollupOptions: { input: { chart: page("chart.html") } },
  },
});
