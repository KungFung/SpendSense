// index.js — the one file other people should import (Node only).
//
//   const { loadStatementCsv, classifyTransactions, detectImpulseSpending } = require("./src/classifier");
//
//   const transactions = loadStatementCsv("sample-data/sample_statement.csv");
//   const classified   = await classifyTransactions(transactions);   // adds label/confidence/reason/source
//   const flags        = detectImpulseSpending(classified);          // gentle impulse flags
//
// The website can't use this file (it has the AI key step). It loads keywords.js, classifier.js,
// impulse.js and csvLoader.js directly and uses classifyByRules: same rules, no AI.

const { classifyByRules } = require("./classifier");
const { detectImpulseSpending } = require("./impulse");
const { loadStatementCsv, parseStatementCsv } = require("./csvLoader");
const { askGeminiAboutUnsure } = require("./gemini");

// MAIN FUNCTION. Give it an array of transactions, get the same transactions back
// with label / confidence / reason / source added.
//
// options.useAI (default true): send the unsure ones to Gemini, IF a key is set.
// It is async because of the optional AI step, so call it with:  await classifyTransactions(list)
async function classifyTransactions(transactions, options = {}) {
  const useAI = options.useAI !== false;
  const classified = transactions.map(classifyByRules);

  if (!useAI) return classified;

  // Only the unsure ones go to the AI. If anything goes wrong, they simply stay unsure.
  const unsure = classified.filter((t) => t.label === "unsure");
  const aiAnswers = await askGeminiAboutUnsure(unsure, options); // returns [] on any problem

  // Copy the AI's answers back onto the matching transactions.
  aiAnswers.forEach((answer) => {
    const transaction = unsure[answer.id];
    if (!transaction) return;
    transaction.label = answer.label;
    transaction.confidence = answer.confidence;
    transaction.reason = `AI: ${answer.reason}`;
    transaction.source = "ai";
  });

  return classified;
}

module.exports = { classifyTransactions, classifyByRules, detectImpulseSpending, loadStatementCsv, parseStatementCsv };
