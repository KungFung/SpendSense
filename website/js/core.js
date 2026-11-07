// Pact — shared helpers, demo data and app state. Loaded first.
// Everything is stored in the browser (localStorage); no backend yet.

const HOUR_MS = 60 * 60 * 1000;
const READY_WINDOW_DAYS = 7;
const MILESTONES = [3, 7, 14, 30, 60, 100];

// Demo data until the streak tracker, statement upload and AI setup exist (see PROJECT.md).
const DEMO = {
  streakDays: 12,
  onTrackLast30: 26,
  protectedThisMonth: 610,
  usualTakeaway: 18, // Jordan's typical takeaway, from their statement
  rules: [
    { id: "late_night", icon: "🌙", text: "Hold purchases over £50 between midnight and 6am", action: "Hold 24h" },
    { id: "big_purchase", icon: "📺", text: "Hold unplanned purchases over £150, so I plan them first", action: "Hold" },
    { id: "bnpl_stack", icon: "🛍️", text: "Hold a 3rd buy-now-pay-later plan in the same week", action: "Hold 24h" },
    { id: "takeaways", icon: "🍔", text: "Nudge me when a takeaway is much bigger than usual", action: "Nudge" },
    { id: "rent_floor", icon: "🏠", text: "Never let my balance fall below £650 (rent money)", action: "Hold" },
  ],
  // Purchases for the demo panel and the fake shop. Same shape as statement.js transactions.
  // "time" is when the purchase happens; without it, Pact uses its own (demo) clock.
  purchases: [
    { id: "tesco", label: "🛒 Tesco £23.40 at 6:05pm", shop: "Tesco", amount: 23.4, category: "groceries", type: "need", time: "18:05" },
    { id: "kwikfit", label: "🔧 Kwik Fit £79.99 at 9:30am", shop: "Kwik Fit", amount: 79.99, category: "car repair", type: "need", time: "09:30" },
    { id: "deliveroo", label: "🍔 Deliveroo £80.20 at 11:48pm", shop: "Deliveroo", amount: 80.2, category: "takeaway", type: "want", time: "23:48" },
    { id: "asos", label: "🛍️ Klarna × ASOS £340 at 1:47am", shop: "Klarna × ASOS", amount: 340, category: "clothes", type: "want", bnpl: true, time: "01:47" },
    { id: "tv", label: "📺 Currys TV £450 (Pact's clock)", shop: "Currys TV", amount: 450, category: "electronics", type: "want" },
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
let holds = load("pact.holds", []); // purchases Pact is holding, newest first

const $ = (id) => document.getElementById(id);
const money = (n) => "£" + Number(n).toLocaleString("en-GB", Number(n) % 1
  ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  : {});
