// impulse.js — spots spending patterns that MIGHT be impulsive, and says so kindly.
//
// Input: transactions that have already been through classifyTransactions().
// Output: a list of "flags", each with a supportive message AND the numbers behind it,
// so the frontend (and the judges) can see exactly why it was flagged.
//
// Every number here is calculated in this file. The AI is never asked for numbers.
//
// Three checks:
//   1. "big_want"      one want that is much bigger than this person's usual want
//   2. "busy_day"      lots of wants on a single day
//   3. "payday_burst"  a lot of want spending in the few days after payday

// ---- Settings: tweak these to make the checks stricter or gentler ----
const SETTINGS = {
  bigWantMultiple: 3, // a want 3x bigger than your usual want...
  bigWantMinimum: 30, // ...and at least £30 (so £9 vs £3 isn't flagged)
  minWantsForBaseline: 5, // need at least 5 wants before we know what "usual" is
  busyDayCount: 4, // 4+ wants on one day
  paydayMinimum: 500, // money in of £500+ counts as payday
  paydayWindowDays: 3, // look at payday + the next 3 days
  paydayBurstMinimum: 100, // flag if £100+ of wants in that window...
  paydayBurstMultiple: 2, // ...and at least 2x what you'd normally spend in that many days
};

// Regular subscriptions aren't impulsive, so they're left out of these checks.
const NOT_IMPULSIVE_GROUPS = ["subscriptions/entertainment", "gym/fitness"];

// ---- Small helpers ----
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => (Number.isInteger(round2(n)) ? `£${round2(n)}` : `£${round2(n).toFixed(2)}`);
const spent = (t) => Math.abs(t.amount); // money out is negative; we want the positive size

function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// "2026-09-12" -> a whole-day number we can subtract
const dayNumber = (isoDate) => Math.round(Date.parse(isoDate + "T00:00:00Z") / 86400000);

// "2026-09-12" -> "12 Sep"
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDate(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

// A short shop name for messages: the first word, tidied.
//   "ASOS.COM" -> "Asos",  "STEAM PURCHASE" -> "Steam"
//   "7658 20Aug26 C , ASOS.COM , GB" -> "Asos"  (card payments: the shop is the middle part)
function shortName(description) {
  const parts = String(description || "").split(",");
  const shopPart = parts.length >= 3 ? parts[1] : parts[0];
  const firstWord = shopPart.split(/[^A-Za-z&']+/).find(Boolean) || "a shop";
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
}

const summarise = (t) => ({ date: t.date, description: t.description, amount: t.amount });

function detectImpulseSpending(classifiedTransactions, settings = {}) {
  const s = { ...SETTINGS, ...settings };
  const flags = [];

  const withDates = classifiedTransactions.filter((t) => t.date && Number.isFinite(t.amount));
  const wants = withDates.filter((t) => t.label === "want" && t.amount < 0 && !NOT_IMPULSIVE_GROUPS.includes(t.group));
  if (wants.length === 0) return flags;

  // ---- 1. A want much bigger than usual ----
  const usualWant = median(wants.map(spent));
  if (wants.length >= s.minWantsForBaseline) {
    wants.forEach((t) => {
      const amount = spent(t);
      if (amount >= s.bigWantMinimum && amount >= usualWant * s.bigWantMultiple) {
        const times = round2(amount / usualWant);
        flags.push({
          type: "big_want",
          date: t.date,
          message:
            `Your ${money(amount)} ${shortName(t.description)} purchase on ${niceDate(t.date)} was about ` +
            `${Math.round(times)}x your usual want purchase (${money(usualWant)}). ` +
            `If it was planned, great! If not, a short cooling-off pause could help next time.`,
          numbers: { amount: round2(amount), usualWantPurchase: round2(usualWant), timesUsual: times },
          transactions: [summarise(t)],
        });
      }
    });
  }

  // ---- 2. Lots of wants on one day ----
  const wantsByDay = {};
  wants.forEach((t) => (wantsByDay[t.date] = [...(wantsByDay[t.date] || []), t]));
  const dailyTotals = Object.values(wantsByDay).map((list) => list.reduce((sum, t) => sum + spent(t), 0));
  const usualDaily = median(dailyTotals);

  Object.entries(wantsByDay).forEach(([date, list]) => {
    if (list.length < s.busyDayCount) return;
    const total = list.reduce((sum, t) => sum + spent(t), 0);
    const times = round2(total / usualDaily);
    const kinds = [...new Set(list.map((t) => (t.group || "other").split("/").pop()))].join(", ");
    flags.push({
      type: "busy_day",
      date,
      message:
        `You had ${list.length} ${kinds} purchases on ${niceDate(date)} (${money(total)}), ` +
        `about ${Math.round(times)}x your usual daily want spending (${money(usualDaily)}). ` +
        `Busy days happen. Was it a tough day, or a treat you'd planned?`,
      numbers: { count: list.length, total: round2(total), usualDailyWantSpending: round2(usualDaily), timesUsual: times },
      transactions: list.map(summarise),
    });
  });

  // ---- 3. A burst of wants just after payday ----
  // Baseline: average want spending for a window of the same length, over the whole statement.
  const days = withDates.map((t) => dayNumber(t.date));
  const statementDays = Math.max(...days) - Math.min(...days) + 1;
  const windowLength = s.paydayWindowDays + 1; // payday itself + the next N days
  const totalWants = wants.reduce((sum, t) => sum + spent(t), 0);
  const usualWindow = (totalWants / statementDays) * windowLength;

  const paydays = [...new Set(withDates.filter((t) => t.amount >= s.paydayMinimum).map((t) => t.date))];
  paydays.forEach((payday) => {
    const start = dayNumber(payday);
    const inWindow = wants.filter((t) => dayNumber(t.date) >= start && dayNumber(t.date) <= start + s.paydayWindowDays);
    const total = inWindow.reduce((sum, t) => sum + spent(t), 0);
    if (total < s.paydayBurstMinimum || total < usualWindow * s.paydayBurstMultiple) return;

    const times = round2(total / usualWindow);
    const shops = [...new Set(inWindow.map((t) => shortName(t.description)))].join(", ");
    flags.push({
      type: "payday_burst",
      date: payday,
      message:
        `In the ${s.paydayWindowDays} days after payday on ${niceDate(payday)} you spent ${money(total)} on wants ` +
        `(${shops}), about ${times.toFixed(1)}x what you'd usually spend in ${windowLength} days (${money(usualWindow)}). ` +
        `Treating yourself on payday is normal. Just checking it all felt worth it.`,
      numbers: { total: round2(total), usualForThisManyDays: round2(usualWindow), timesUsual: times, windowDays: windowLength },
      transactions: inWindow.map(summarise),
    });
  });

  // Oldest first, so it reads like a timeline.
  return flags.sort((a, b) => a.date.localeCompare(b.date));
}

module.exports = { detectImpulseSpending, SETTINGS, median };
