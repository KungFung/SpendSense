// index.js — the one file other people should import.
//
//   const { loadStatementCsv, classifyTransactions, detectImpulseSpending } = require("./src/classifier");
//
//   const transactions = loadStatementCsv("sample-data/sample_statement.csv");
//   const classified   = await classifyTransactions(transactions);   // adds label/confidence/reason/source
//   const flags        = detectImpulseSpending(classified);          // gentle impulse flags

const { classifyTransactions, classifyByRules } = require("./classifier");
const { detectImpulseSpending } = require("./impulse");
const { loadStatementCsv, parseStatementCsv } = require("./csvLoader");

module.exports = { classifyTransactions, classifyByRules, detectImpulseSpending, loadStatementCsv, parseStatementCsv };
