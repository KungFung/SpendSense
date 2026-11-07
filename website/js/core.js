// Pact — shared helpers, demo data and app state. Loaded first.
// Everything is stored in the browser (localStorage); no backend yet.

const HOUR_MS = 60 * 60 * 1000;
const READY_WINDOW_DAYS = 7;
const MILESTONES = [3, 7, 14, 30, 60, 100];

// Demo data until the streak tracker and rules engine exist (see PROJECT.md).
const DEMO = {
  streakDays: 12,
  onTrackLast30: 26,
  protectedThisMonth: 610,
  hold: { item: "Klarna × ASOS", price: 340 },
  rules: [
    { icon: "🌙", text: "Hold purchases over £50 between midnight and 6am", action: "Hold 24h" },
    { icon: "🛍️", text: "Hold a 3rd buy-now-pay-later plan in the same week", action: "Hold 24h" },
    { icon: "🍔", text: "Nudge me after 3 takeaways in a week", action: "Nudge" },
    { icon: "🏠", text: "Never let my balance fall below £650 (rent money)", action: "Hold" },
  ],
};

// Some viewers block localStorage; fall back to in-memory state so the page still works.
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

let plans = load("pact.plans", []);
let kept = load("pact.kept", 0);
let holdStatus = load("pact.hold", "held"); // held | planned | cancelled

const $ = (id) => document.getElementById(id);
const money = (n) => "£" + Number(n).toLocaleString("en-GB");

