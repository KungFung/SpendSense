import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const page = (p) => fileURLToPath(new URL(`./website/${p}`, import.meta.url));

// `npm run dev` serves website/ (so index.html works too) and opens the spending chart.
// The chart reads statement_withinfo.csv from the repo root (imported in website/chart.jsx).
export default defineConfig({
  root: "website",
  plugins: [react()],
  server: { open: "/chart.html" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // Only the chart is built. index.html loads plain scripts and is opened directly, no build needed.
    rollupOptions: { input: { chart: page("chart.html") } },
  },
});
