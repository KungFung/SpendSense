// Pact — streak tracker.
// Uses the uploaded statement for daily want totals and explicit emergency overrides.
// A missing daily allowance means that allowance checks are disabled (as specified
// in PROJECT.md, where the allowance is optional).

const STREAK_ALLOWANCE_KEY = "pact.dailyWantAllowance";
const STREAK_EVENTS_KEY = "pact.streakEvents";

function getDailyWantAllowance() {
  const stored = load(STREAK_ALLOWANCE_KEY, null);
  if (stored === null || stored === "") return null;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function setDailyWantAllowance(value) {
  if (value === null || value === "") {
    try { localStorage.removeItem(STREAK_ALLOWANCE_KEY); } catch {}
    return;
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid allowance of £0 or more.");
  save(STREAK_ALLOWANCE_KEY, amount);
}

function recordEmergencyOverride(date) {
  const day = streakDateKey(date);
  if (!day) return;
  const events = load(STREAK_EVENTS_KEY, []);
  if (!events.some((event) => event.date === day && event.type === "emergency_override")) {
    events.push({ date: day, type: "emergency_override", createdAt: Date.now() });
    save(STREAK_EVENTS_KEY, events);
  }
  renderStreak();
}

function streakDateKey(value) {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isoWeekKey(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function calculateStreak(sourceTransactions, options = {}) {
  const allowance = options.allowance === undefined ? getDailyWantAllowance() : options.allowance;
  const events = options.events || load(STREAK_EVENTS_KEY, []);
  const days = new Map();

  (sourceTransactions || []).forEach((tx) => {
    const date = streakDateKey(tx.date);
    if (!date) return;
    if (!days.has(date)) days.set(date, { wantSpend: 0, emergencyOverride: false, ruleBroken: false });
    const day = days.get(date);
    if (tx.type === "want" && Number.isFinite(Number(tx.amount))) day.wantSpend += Math.abs(Number(tx.amount));
    if (tx.emergencyOverride) day.emergencyOverride = true;
    if (tx.ruleBroken) day.ruleBroken = true;
  });

  (events || []).forEach((event) => {
    const date = streakDateKey(event.date);
    if (!date || event.type !== "emergency_override") return;
    if (!days.has(date)) days.set(date, { wantSpend: 0, emergencyOverride: false, ruleBroken: false });
    days.get(date).emergencyOverride = true;
  });

  if (days.size === 0) return { hasData: false, days: 0, onTrackLast30: 0, latestDate: null, statuses: [] };

  const sortedDates = [...days.keys()].sort();
  const first = new Date(`${sortedDates[0]}T12:00:00Z`);
  const last = new Date(`${sortedDates.at(-1)}T12:00:00Z`);
  const statusByDate = new Map();
  const graceUsedByWeek = new Set();

  // Every calendar day between the first and last transaction is represented.
  // A day with no recorded purchases is on track; no activity is not a failure.
  for (let cursor = new Date(first); cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    const day = days.get(date) || { wantSpend: 0, emergencyOverride: false, ruleBroken: false };
    const allowanceExceeded = allowance !== null && day.wantSpend > Number(allowance) + 0.000001;
    const broken = day.emergencyOverride || day.ruleBroken || allowanceExceeded;
    let status = "on_track";
    let reason = "";

    if (day.emergencyOverride) reason = "Emergency release on a non-essential purchase";
    else if (day.ruleBroken) reason = "A flagged purchase broke a Pact rule";
    else if (allowanceExceeded) reason = "Daily non-essential spending allowance exceeded";

    if (broken) {
      const week = isoWeekKey(date);
      if (!graceUsedByWeek.has(week)) {
        status = "grace";
        graceUsedByWeek.add(week);
      } else {
        status = "broken";
      }
    }
    statusByDate.set(date, { date, status, reason, wantSpend: Math.round(day.wantSpend * 100) / 100 });
  }

  const statuses = [...statusByDate.values()];
  const latestDate = statuses.at(-1).date;
  let current = 0;
  for (let i = statuses.length - 1; i >= 0; i--) {
    if (statuses[i].status === "broken") break;
    current++;
  }
  const last30 = statuses.slice(-30);
  return {
    hasData: true,
    days: current,
    onTrackLast30: last30.filter((day) => day.status !== "broken").length,
    coveredDays: statuses.length,
    latestDate,
    statuses,
    allowance,
  };
}

function renderStreak() {
  const result = statement ? calculateStreak(transactions) : null;
  const days = result?.hasData ? result.days : DEMO.streakDays;
  const onTrack = result?.hasData ? result.onTrackLast30 : DEMO.onTrackLast30;
  const next = MILESTONES.find((m) => m > days) ?? days;
  const prev = [...MILESTONES].reverse().find((m) => m <= days) ?? 0;

  $("streak-days").textContent = days;
  $("streak-progress").style.width = next === prev ? "100%" : ((days - prev) / (next - prev)) * 100 + "%";
  const allowanceText = result?.hasData
    ? (result.allowance === null ? " · daily limit not set" : ` · £${result.allowance.toFixed(2)}/day want limit`)
    : "";
  const asOf = result?.hasData && result.latestDate
    ? ` · statement through ${new Date(`${result.latestDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "";
  $("streak-sub").textContent = `${next > days ? `${next - days} days to your ${next}-day badge · ` : ""}${onTrack} of the last ${result?.hasData ? Math.min(30, result.coveredDays) : 30} days on track${allowanceText}${asOf}`;

  $("badges").replaceChildren(...MILESTONES.map((m) => {
    const b = document.createElement("span");
    b.className = "badge" + (days >= m ? " earned" : "");
    b.textContent = m + " days";
    return b;
  }));
}

// Expose the pure calculator for automated tests; browser scripts remain classic globals.
if (typeof module === "object" && module.exports) {
  module.exports = { calculateStreak, isoWeekKey, streakDateKey };
}

// The allowance is optional. Let the user set or clear it without changing the CSV.
if (typeof document !== "undefined") $("streak-allowance")?.addEventListener("click", () => {
  const current = getDailyWantAllowance();
  const answer = prompt(
    "Daily non-essential spending limit in £. Leave blank to turn this check off.",
    current === null ? "" : String(current),
  );
  if (answer === null) return;
  try {
    setDailyWantAllowance(answer.trim());
    renderStreak();
  } catch (error) {
    toast("Invalid daily limit", error.message);
  }
});
