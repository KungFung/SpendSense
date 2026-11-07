// csvLoader.js — a SIMPLE stand-in CSV loader.
//
// A teammate is building the real bank statement parser. Until then, this turns a CSV
// file into the shared transaction format that the classifier expects:
//
//   { date: "2026-09-01", description: "Tesco", amount: -45.00,
//     type: "expense", category: null, merchant: null }
//
// Rules:
//   - amount: negative = money out, positive = money in.
//   - type:   "income" if amount > 0, otherwise "expense".
//   - Anything we don't know is null. We never invent values.
//
// The website loads this file too (index.html) to read a statement the user uploads.

(function () { // keeps these names private when loaded in the browser


// Split ONE line of CSV into its cells. Handles quoted cells that contain commas,
// e.g.  "'3167 03Nov26 C , DELIVEROO , GB"  stays as one cell.
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && insideQuotes && line[i + 1] === '"') {
      current += '"'; // "" inside quotes means a literal quote mark
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Turn a date into "YYYY-MM-DD". Accepts the formats we have seen so far:
//   "2026-09-01"          (ISO, our sample file)
//   "01/09/2026"          (UK day/month/year)
//   "05 Nov 2026 06:00"   (the team's statement.csv; the time is dropped)
// Returns null if the date can't be understood.
function toIsoDate(text) {
  if (!text) return null;
  const pad = (n) => String(n).padStart(2, "0");

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${pad(match[2])}-${pad(match[1])}`;

  match = text.match(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})/);
  if (match && MONTHS[match[2].toLowerCase()]) {
    return `${match[3]}-${pad(MONTHS[match[2].toLowerCase()])}-${pad(match[1])}`;
  }
  return null;
}

// Turn CSV text into transactions. Header names are matched case-insensitively.
// "Amount" or "Value" both work; "Category" and an explicit "Emergency Override" column are optional.
function parseStatementCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (...names) => headers.findIndex((h) => names.includes(h));
  const dateCol = col("date");
  const descriptionCol = col("description");
  const amountCol = col("amount", "value");
  const categoryCol = col("category");
  const emergencyCol = col("emergency override", "emergency", "emergency_used");
  const flaggedCol = col("flagged", "rule broken", "rule_broken");
  const preApprovedCol = col("pre-approved", "preapproved", "pre approved", "planned", "planned purchase");
  const isYes = (value) => ["yes", "true", "1", "y", "used"].includes(String(value || "").trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const amount = Number.parseFloat(cells[amountCol]);
    // Some bank exports start text with ' so Excel won't treat it as a formula; remove it.
    const description = (cells[descriptionCol] || "").replace(/^'/, "").trim();

    return {
      date: toIsoDate(cells[dateCol]),
      description: description || null,
      amount: Number.isFinite(amount) ? amount : null,
      type: !Number.isFinite(amount) ? null : amount > 0 ? "income" : "expense",
      category: categoryCol >= 0 && cells[categoryCol] ? cells[categoryCol] : null,
      ...(emergencyCol >= 0 ? { emergencyOverride: isYes(cells[emergencyCol]) } : {}),
      ...(flaggedCol >= 0 ? { flagged: isYes(cells[flaggedCol]) } : {}),
      ...(preApprovedCol >= 0 ? { preApproved: isYes(cells[preApprovedCol]) } : {}),
      merchant: null, // the real parser may fill this in later
    };
  });
}

// Read a CSV file from disk and parse it.
function loadStatementCsv(filePath) {
  const fs = require("node:fs"); // Node only, so it's loaded here and not at the top
  return parseStatementCsv(fs.readFileSync(filePath, "utf8"));
}

const api = { loadStatementCsv, parseStatementCsv, toIsoDate, splitCsvLine };

// Works in Node (require) AND in the browser (<script> tag, then use window.SpendSense).
if (typeof module === "object" && module.exports) module.exports = api;
else globalThis.SpendSense = Object.assign(globalThis.SpendSense || {}, api);
})();
