// run.js — `npm run classify` loads a CSV, classifies it and prints a readable summary.
//
//   npm run classify                         (uses sample-data/sample_statement.csv)
//   npm run classify -- statement.csv        (any other CSV)
//   npm run classify -- --no-ai              (rules only, never calls Gemini)

const path = require("node:path");
const { loadStatementCsv, classifyTransactions, detectImpulseSpending } = require("./index");

const args = process.argv.slice(2);
const useAI = !args.includes("--no-ai");
const csvPath = args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "..", "sample-data", "sample_statement.csv");

const money = (n) => `£${n.toFixed(2)}`;
const sumOf = (list) => list.reduce((sum, t) => sum + Math.abs(t.amount), 0);

async function main() {
  const transactions = loadStatementCsv(csvPath);
  const classified = await classifyTransactions(transactions, { useAI });
  const flags = detectImpulseSpending(classified);

  const byLabel = (label) => classified.filter((t) => t.label === label);
  const aiUsed = classified.some((t) => t.source === "ai");

  console.log(`\nLoaded ${transactions.length} transactions from ${path.relative(process.cwd(), csvPath)}`);
  console.log(useAI ? (aiUsed ? "Gemini helped with the unsure ones.\n" : "AI not used (no GEMINI_API_KEY in .env, the AI call failed, or nothing was unsure).\n") : "AI switched off (--no-ai).\n");

  console.log("TOTALS");
  for (const label of ["income", "need", "want", "unsure"]) {
    const list = byLabel(label);
    console.log(`  ${label.padEnd(7)} ${money(sumOf(list)).padStart(10)}   (${list.length} transactions)`);
  }

  console.log("\nTOP 5 WANTS");
  [...byLabel("want")]
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .forEach((t) => console.log(`  ${t.date}  ${money(-t.amount).padStart(8)}  ${t.description}`));

  const unsure = byLabel("unsure");
  if (unsure.length) {
    console.log("\nSTILL UNSURE (the user could tap need/want)");
    unsure.forEach((t) => console.log(`  ${t.date}  ${money(-t.amount).padStart(8)}  ${t.description}  (${t.reason})`));
  }

  const ai = classified.filter((t) => t.source === "ai");
  if (ai.length) {
    console.log("\nDECIDED BY AI");
    ai.forEach((t) => console.log(`  ${t.description} -> ${t.label} (${Math.round(t.confidence * 100)}%) ${t.reason}`));
  }

  console.log(`\nIMPULSE FLAGS (${flags.length})`);
  if (flags.length === 0) console.log("  Nothing stood out. Nice!");
  flags.forEach((f) => console.log(`  - [${f.type}] ${f.message}`));
  console.log("");
}

main().catch((error) => {
  console.error("Something went wrong:", error.message);
  process.exitCode = 1;
});
