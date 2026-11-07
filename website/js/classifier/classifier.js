// classifier.js — labels each transaction as "need", "want", "unsure" or "income".
//
// It works in this order (cheapest and most predictable first):
//   0. Money coming in (amount > 0)          -> "income"
//   1. Keyword rules  (keywords.js)          -> "need" / "want"
//   2. Category rules (if a category exists) -> "need" / "want"
//   3. Nothing matched, or a mixed shop      -> "unsure"
//   4. (optional) Gemini looks at ONLY the unsure ones: see classifyTransactions in index.js
//
// This file has no AI and no Node features, so the website loads it too (index.html).
//
// Each transaction comes back with 4 extra fields (plus "group", a short shop type):
//   label:      "need" | "want" | "unsure" | "income"
//   confidence: 0 to 1 (how sure we are)
//   reason:     a short sentence a human can read
//   source:     "keyword" | "category" | "ai"  (which step decided)

(function () { // keeps these names private when loaded in the browser

const { KEYWORD_RULES, CATEGORY_RULES } = typeof require === "function" ? require("./keywords") : globalThis.SpendSense;

// Make text easy to compare: "McDonald's 1182" -> "MCDONALDS 1182",
// "AMAZON.CO.UK*2K4P1" -> "AMAZON CO UK 2K4P1".
function normalise(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/['’]/g, "") // drop apostrophes so MCDONALD'S == MCDONALDS
    .replace(/[^A-Z0-9]+/g, " ") // every other symbol becomes a space
    .trim();
}

// Build one flat list of { keyword, label, group } once, longest keyword first,
// so a more specific keyword ("UBER EATS") is checked before a general one ("UBER").
const KEYWORD_LIST = KEYWORD_RULES.flatMap((rule) =>
  rule.keywords.map((keyword) => ({ keyword: normalise(keyword), label: rule.label, group: rule.group }))
).sort((a, b) => b.keyword.length - a.keyword.length);

// Find the first keyword that matches the START of a word in the description.
// We add a space in front of both so " TESCO" must line up with a word start.
function findKeyword(description) {
  const text = " " + normalise(description);
  return KEYWORD_LIST.find((entry) => text.includes(" " + entry.keyword)) || null;
}

// Classify ONE transaction using only our own rules (no AI). Never changes the input.
function classifyByRules(transaction) {
  const result = { ...transaction };

  // Step 0: money in is income, no need to guess.
  if (transaction.type === "income" || transaction.amount > 0) {
    return { ...result, label: "income", group: "income", confidence: 1, reason: "Money coming in", source: "category" };
  }

  // Step 1: keyword rules.
  const match = findKeyword(transaction.description);
  if (match && match.label !== "unsure") {
    return {
      ...result,
      label: match.label,
      group: match.group,
      confidence: 0.9,
      reason: `Matched "${match.keyword}" (${match.group}), usually a ${match.label}`,
      source: "keyword",
    };
  }

  // Step 2: category rules, only if a category exists.
  const categoryLabel = transaction.category ? CATEGORY_RULES[transaction.category.toLowerCase()] : undefined;
  if (categoryLabel) {
    return {
      ...result,
      label: categoryLabel,
      group: transaction.category.toLowerCase(),
      confidence: 0.75,
      reason: `Category "${transaction.category}" is usually a ${categoryLabel}`,
      source: "category",
    };
  }

  // Step 3: unsure. Either a known mixed shop (Amazon, PayPal...) or no rule at all.
  if (match) {
    return {
      ...result,
      label: "unsure",
      group: match.group,
      confidence: 0.3,
      reason: `"${match.keyword}" (${match.group}) could be a need or a want`,
      source: "keyword",
    };
  }
  return { ...result, label: "unsure", group: null, confidence: 0, reason: "No rule matched this description", source: "keyword" };
}

const api = { classifyByRules, findKeyword, normalise };

// Works in Node (require) AND in the browser (<script> tag, then use window.SpendSense).
if (typeof module === "object" && module.exports) module.exports = api;
else globalThis.SpendSense = Object.assign(globalThis.SpendSense || {}, api);
})();
