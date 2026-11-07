// Pact — bank statement upload.   OWNER: Person 2 (statement upload)
//
// Read the CSV, clean shop names, mark each purchase as a need or a want,
// build the user's baseline, and flag unusual wants as possible impulse buys.
// See ../../scripts/anomaly_detection.py for the Python version of the baseline.
//
// Produce transactions in this shape (everyone else reads them):
// {
//   date: "2026-10-31T01:47",
//   shop: "ASOS",
//   amount: 340,
//   category: "clothes",
//   type: "want",                 // "need" or "want"
//   impulseScore: 7,
//   reasons: ["Late at night", "4× your usual", "Buy now pay later"]
// }

let transactions = [];
