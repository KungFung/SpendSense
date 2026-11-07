// Spending analysis worked out in the browser from the bank statement.
// This is a port of scripts/anomaly_detection.py, so the results match daily_spending_analysis.csv
// and spending_anomalies.csv without needing those files.

// Same defaults as SpendingAnomalyDetector in the Python script.
export const DETECTION_SETTINGS = {
  elevatedThreshold: 1.5,
  potentialThreshold: 2.5,
  significantThreshold: 3.5,
  minimumDifference: 10, // a day must be at least £10 over expected to count as unusual
  minimumScale: 5, // stops tiny day-to-day variation making every small purchase look unusual
  weekdayHistoryMin: 4, // use same-weekday history once there are this many past same weekdays...
  weekdayHistoryMax: 13, // ...looking back at most this many of them
  fallbackDays: 28, // otherwise use the last 28 days
  minimumHistory: 7, // no baseline with fewer values than this
};

const FIXED_TYPES = new Set(["D/D", "S/O"]); // bills: direct debits and standing orders

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (iso) => iso.slice(0, 10); // "2026-11-05T06:00" -> "2026-11-05"
const keyToUtc = (key) => Date.parse(`${key}T00:00Z`); // UTC so clock changes don't skip or repeat days
const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// transactions: output of parseStatement (money in and out).
// Returns:
//   purchases: money going out, oldest first   { date, type, description, amount, flagged, preApproved }
//   days:      one row per day, no gaps         { date, total, variable, bills, baseline, usualLow, usualHigh, score, classification }
//   anomalies: the unusual days                 { date, classification, actual, expected, difference, score, largestTransaction }
export function analyseStatement(transactions, settings = DETECTION_SETTINGS) {
  const s = { ...DETECTION_SETTINGS, ...settings };

  const purchases = transactions
    .filter((t) => t.value < 0)
    .map(({ date, type, description, value, flagged, preApproved }) => ({
      date,
      type,
      description,
      amount: -value,
      flagged,
      preApproved,
    }));

  if (transactions.length === 0) return { purchases, days: [], anomalies: [] };

  // 1. Add up each day. Days with no transactions are kept, as zeros.
  const keys = transactions.map((t) => dayKey(t.date)).sort();
  const days = [];
  const byKey = new Map();
  for (let t = keyToUtc(keys[0]); t <= keyToUtc(keys[keys.length - 1]); t += DAY_MS) {
    const day = { date: utcToKey(t), weekday: new Date(t).getUTCDay(), total: 0, variable: 0, bills: 0, items: [] };
    days.push(day);
    byKey.set(day.date, day);
  }
  for (const t of transactions) {
    if (t.value >= 0) continue;
    const day = byKey.get(dayKey(t.date));
    const fixed = FIXED_TYPES.has(t.type);
    day.total += -t.value;
    if (fixed) day.bills += 1;
    else {
      day.variable += -t.value;
      day.items.push(t);
    }
  }

  // 2. Expected spending for each day: the median of earlier days' day-to-day spending,
  //    using the same weekday when there's enough history, otherwise the last 28 days.
  days.forEach((day, i) => {
    const history = days.slice(0, i);
    const sameWeekday = history.filter((d) => d.weekday === day.weekday);
    const values = (
      sameWeekday.length >= s.weekdayHistoryMin
        ? sameWeekday.slice(-s.weekdayHistoryMax)
        : history.slice(-s.fallbackDays)
    ).map((d) => d.variable);

    day.baseline = null;
    day.usualLow = null;
    day.usualHigh = null;
    day.score = null;
    day.classification = "Insufficient history";
    if (values.length < s.minimumHistory) return;

    const baseline = median(values);
    const mad = median(values.map((v) => Math.abs(v - baseline))); // typical distance from the median
    const scale = Math.max(1.4826 * mad, s.minimumScale); // 1.4826 turns MAD into a standard-deviation estimate
    const difference = day.variable - baseline;

    day.baseline = baseline;
    // Usual range for the day. The top is exactly where "Elevated" starts (score >= 1.5 and at
    // least £10 over expected), so a day is unusual exactly when its spending is above this range.
    day.usualHigh = baseline + Math.max(s.elevatedThreshold * scale, s.minimumDifference);
    day.usualLow = Math.max(0, baseline - s.elevatedThreshold * scale);
    day.score = difference / scale;
    day.difference = difference;
    day.classification = "Normal";
    if (difference >= s.minimumDifference) {
      if (day.score >= s.significantThreshold) day.classification = "Significant overspending";
      else if (day.score >= s.potentialThreshold) day.classification = "Potential overspending";
      else if (day.score >= s.elevatedThreshold) day.classification = "Elevated";
    }
  });

  // 3. List the unusual days, with the biggest day-to-day purchase as the likely cause.
  const UNUSUAL = new Set(["Elevated", "Potential overspending", "Significant overspending"]);
  const anomalies = days
    .filter((d) => UNUSUAL.has(d.classification))
    .map((d) => {
      const largest = d.items.reduce((a, b) => (-b.value > -(a?.value ?? 0) ? b : a), null);
      return {
        date: d.date,
        classification: d.classification,
        actual: d.variable,
        expected: d.baseline,
        difference: d.difference,
        score: d.score,
        largestTransaction: largest ? largest.description : "Unknown",
      };
    });

  return {
    purchases,
    days: days.map(({ date, total, variable, bills, baseline, usualLow, usualHigh, score, classification }) => ({
      date,
      total,
      variable,
      bills,
      baseline,
      usualLow,
      usualHigh,
      score,
      classification,
    })),
    anomalies,
  };
}
