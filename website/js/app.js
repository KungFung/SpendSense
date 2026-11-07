// Pact — dashboard, navigation and start-up. Loaded last.

// ---------- Clock, greeting and risk forecast ----------
function demoNow() {
  if (!$("demo-night").checked) return new Date();
  const d = new Date();
  d.setHours(1, 47, 0, 0);
  return d;
}

function renderClock() {
  const now = demoNow();
  const h = now.getHours();
  const night = h >= 23 || h < 6;
  document.body.classList.toggle("night", night);
  notifyChart({ type: "pact:night", on: night });

  $("clock").textContent = now.toLocaleString("en-GB", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  $("status-title").textContent = night ? "Your pact is on watch" : "You're calm today";
  $("greeting").textContent =
    night ? "Still up?" : h < 12 ? "Good morning," : h < 18 ? "Good afternoon," : "Good evening,";

  // Jordan's riskiest window, learned from their history: payday Fridays, 11pm–3am.
  const friday = now.getDay() === 5;
  const risk = $("risk-card");
  if (night) {
    risk.className = "card risk high";
    $("risk-title").textContent = "You're in a high-risk window";
    $("risk-text").textContent = "This is usually when impulse buys happen for you. Your late-night rule is on.";
  } else if (friday && h >= 18) {
    risk.className = "card risk high";
    $("risk-title").textContent = "Tonight is a high-risk window";
    $("risk-text").textContent = "Payday Friday, 11pm–3am. Your late-night rule switches on at midnight.";
  } else {
    risk.className = "card risk";
    $("risk-title").textContent = "Tonight looks calm";
    $("risk-text").textContent = "Your riskiest time is payday Fridays, 11pm–3am. Pact will remind you.";
  }
}

// ---------- Streak ----------
function renderStreak() {
  const days = DEMO.streakDays;
  const next = MILESTONES.find((m) => m > days) ?? days;
  const prev = [...MILESTONES].reverse().find((m) => m <= days) ?? 0;
  $("streak-days").textContent = days;
  $("streak-progress").style.width = ((days - prev) / (next - prev)) * 100 + "%";
  $("streak-sub").textContent =
    `${next - days} days to your ${next}-day badge · ${DEMO.onTrackLast30} of the last 30 days on track`;

  $("badges").replaceChildren(...MILESTONES.map((m) => {
    const b = document.createElement("span");
    b.className = "badge" + (days >= m ? " earned" : "");
    b.textContent = m + " days";
    return b;
  }));
}

// ---------- Render ----------
function render() {
  const now = Date.now();

  const active = plans.filter((p) => ["cooling", "ready"].includes(statusOf(p, now)));
  syncPlanList($("home-plans"), active.slice(0, 4), now);
  $("home-empty").hidden = active.length > 0;

  syncPlanList($("plans"), plans, now);
  $("empty").hidden = plans.length > 0;

  $("protected").textContent = money(DEMO.protectedThisMonth);
  $("kept-home").textContent = money(kept);
}

function renderHolds() {
  const latest = holds[0];
  $("hold-card").hidden = !latest;
  $("hold-done").hidden = Boolean(latest);
  if (!latest) return;
  $("hold-title").textContent = holds.length === 1 ? "1 purchase on hold" : `${holds.length} purchases on hold`;
  $("hold-line").textContent = `${latest.shop} · ${money(latest.amount)}`;
  $("hold-rule-line").textContent = `Rule: ${latest.ruleText}`;
}

function renderRules() {
  $("rules").replaceChildren(...DEMO.rules.map((r) => {
    const li = document.createElement("li");
    li.className = "card rule";
    const icon = document.createElement("div");
    icon.className = "icon";
    icon.textContent = r.icon;
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = r.text;
    const meta = document.createElement("small");
    meta.textContent = r.action + " · set 3 Oct";
    body.append(title, meta);
    li.append(icon, body);
    return li;
  }));
  $("rule-count").textContent = DEMO.rules.length;
}

// ---------- Navigation ----------
const TITLES = {
  home: "Jordan", statement: "Needs & wants", plan: "Plan a purchase", pact: "My Pact",
  demo: "Demo controls", alternatives: "Explore alternatives",
};

function showTab(name) {
  document.querySelectorAll(".nav [data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  $("greeting").hidden = name !== "home";
  $("page-title").textContent = TITLES[name];
}

document.querySelectorAll(".nav [data-tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.go)));

// ---------- Events ----------
$("price").addEventListener("input", () => {
  const price = Number($("price").value);
  $("cooldown-preview").textContent = price > 0 ? `Cooling-off period: ${cooldownHours(price)} hours` : "";
});

$("plan-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const item = $("item").value.trim();
  const price = Number($("price").value);
  if (!item || !(price > 0)) return;
  addPlan(item, price);
  e.target.reset();
  $("cooldown-preview").textContent = "";
  render();
});

// ---------- Purchases (fake shop window + demo panel) ----------
// A purchase arrives, Pact's rules decide, and the result goes back to the shop.
function handlePurchase(purchase) {
  const date = demoNow();
  if (purchase.time) {
    const [h, m] = purchase.time.split(":").map(Number);
    date.setHours(h, m, 0, 0);
  }
  const tx = { ...purchase, date: date.toISOString() };
  const decision = checkPurchase(tx);
  const label = `${tx.shop} ${money(tx.amount)}`;

  if (decision.action === "hold") {
    const hold = {
      id: Date.now().toString(36),
      shop: tx.shop,
      amount: tx.amount,
      ruleText: decision.rule?.text ?? "Your pact",
      reason: decision.reason ?? "",
      planId: decision.plan?.id ?? null,
      createdAt: Date.now(),
    };
    holds.unshift(hold);
    save("pact.holds", holds);
    renderHolds();
    showHold(hold);
  } else if (decision.action === "nudge") {
    showNudge(tx, decision.reason); // recorded as spent only if they tap "Yes, buy it"
  } else {
    if (decision.plan) finish(decision.plan.id, "bought");
    recordSpend(tx.shop, tx.amount, date, { preApproved: Boolean(decision.plan) });
    toast(`✅ ${label}: approved`, decision.reason);
  }
  logActivity(tx, decision);
  return { action: decision.action, reason: decision.reason ?? "" };
}

const ACTION_LABELS = { allow: "Approved", nudge: "Nudge", hold: "Held" };

function logActivity(tx, decision) {
  const time = new Date(tx.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  activity.unshift({
    shop: tx.shop,
    amount: tx.amount,
    time,
    bnpl: Boolean(tx.bnpl),
    action: decision.action,
    reason: decision.reason || decision.rule?.text || "",
  });
  activity = activity.slice(0, 20);
  save("pact.activity", activity);
  renderActivity();
}

function renderActivity() {
  $("activity-empty").hidden = activity.length > 0;
  $("activity").replaceChildren(...activity.map((a) => {
    const li = document.createElement("li");
    const top = document.createElement("div");
    top.className = "activity-top";
    const name = document.createElement("span");
    name.textContent = `${a.shop} · ${a.time}`;
    const right = document.createElement("span");
    const amount = document.createElement("span");
    amount.className = "num";
    amount.textContent = money(a.amount);
    const badge = document.createElement("span");
    badge.className = "result-badge " + a.action;
    badge.textContent = ACTION_LABELS[a.action];
    right.append(amount, " ", badge);
    top.append(name, right);
    const reason = document.createElement("small");
    reason.textContent = a.reason;
    li.append(top, reason);
    return li;
  }));
}

// The shop opened from the demo panel talks to us through window.postMessage;
// a shop opened on its own uses BroadcastChannel (same browser, same computer).
window.addEventListener("message", (e) => {
  if (e.data?.type !== "pact:purchase") return;
  const result = handlePurchase(e.data.purchase);
  e.source?.postMessage({ type: "pact:result", ...result }, "*");
});

try {
  const channel = new BroadcastChannel("pact");
  channel.onmessage = (e) => {
    if (e.data?.type !== "pact:purchase") return;
    channel.postMessage({ type: "pact:result", ...handlePurchase(e.data.purchase) });
  };
} catch {
  // Not supported here; the shop window opened from the demo panel still works.
}

// ---------- Spending chart ----------
// Purchases that go through are saved in the statement's transaction format (see
// components/csvData.js, parseStatement) and chart.jsx adds them on top of the statement.
// flagged: Pact had concerns (nudge, emergency release) · preApproved: planned in advance.
function recordSpend(shop, amount, date, { flagged = false, preApproved = false } = {}) {
  // For the chart's Needs / Wants / Big purchases colours. Nudged or held, then bought anyway = big.
  const segment = flagged ? "big" : labelPurchase({ shop, amount }).type === "need" ? "need" : "want";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  spent.push({
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    type: "POS",
    description: shop,
    value: -amount,
    balance: null,
    flagged,
    preApproved,
    segment,
  });
  save("pact.spent", spent);
  notifyChart({ type: "pact:purchases-changed" });
}

function notifyChart(message) {
  $("chart-frame").contentWindow?.postMessage(message, "*");
}

// The chart is a React page served by Vite, so it only works through `npm run dev`.
if (location.protocol === "file:") {
  $("chart-offline").hidden = false;
} else {
  $("chart-frame").hidden = false;
  $("chart-frame").addEventListener("load", renderClock); // sends the night/day state
  $("chart-frame").src = "chart.html?embed";
}

window.addEventListener("message", (e) => {
  if (e.data?.type === "pact:chart-height" && e.source === $("chart-frame").contentWindow) {
    $("chart-frame").style.height = e.data.height + "px";
  }
});

// ---------- Toasts ----------
function toast(title, text) {
  const el = document.createElement("div");
  el.className = "toast";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const p = document.createElement("p");
  p.textContent = text;
  el.append(strong, p);
  $("toasts").prepend(el);
  [...$("toasts").children].slice(3).forEach((old) => old.remove());
  setTimeout(() => el.remove(), 5000);
}

// ---------- Dashboard hold card ----------
$("card-hold-plan").addEventListener("click", () => holds[0] && planHold(holds[0]));
$("card-hold-cancel").addEventListener("click", () => holds[0] && cancelHold(holds[0]));
$("card-hold-open").addEventListener("click", () => holds[0] && showHold(holds[0]));

// ---------- Demo page ----------
$("demo-night").addEventListener("change", renderClock);
$("open-shop").addEventListener("click", () => {
  window.open("shop.html", "pact-shop", "width=560,height=780");
});

// (The "Story purchases" buttons were removed from the demo page; "Try a purchase" has examples.)

// Custom purchase: any shop, amount, category and time.
$("custom-category").replaceChildren(...Object.entries(DEMO.categories).map(([name, type]) => {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name[0].toUpperCase() + name.slice(1);
  return option;
}));
$("custom-category").value = "clothes";

// Live "Pact thinks..." line, from our need/want classifier (statement.js).
// The shop name decides first (Tesco = need); the category is used for shops Pact doesn't know.
function showCustomType() {
  const shop = $("custom-shop").value.trim();
  if (!shop) {
    $("custom-type").textContent = "Type a shop and Pact will tell you if it's a need or a want.";
    $("custom-type").className = "try-guess";
    return;
  }
  const label = labelPurchase({ shop, amount: Number($("custom-amount").value) || 1, category: $("custom-category").value });
  const kind = label.group ? ` (${label.group})` : "";
  $("custom-type").className = "try-guess " + label.type;
  $("custom-type").textContent = label.type === "need"
    ? `Pact thinks: NEED${kind}. Needs are always let through.`
    : label.type === "want"
      ? `Pact thinks: WANT${kind}. Pact checks it against your rules and your usual spending.`
      : `Pact thinks: WANT${kind}. This shop sells both, so Pact treats it as a want to be safe.`;
}
["custom-shop", "custom-amount", "custom-category"].forEach((id) => $(id).addEventListener("input", showCustomType));
showCustomType();

// Show Pact's answer right under the form.
const RESULT_TEXT = {
  allow: ["✅ Approved", "It went through."],
  nudge: ["💬 Nudge: Pact asked \"Still want it?\"", "Answer in the pop-up."],
  hold: ["⏸️ Held", "Pact paused it. Decide on the hold screen."],
};
function showTryResult(action, reason) {
  const [title, fallback] = RESULT_TEXT[action];
  $("try-result").className = "try-result " + action;
  $("try-result-title").textContent = title;
  $("try-result-text").textContent = reason || fallback;
  $("try-result").hidden = false;
}
document.addEventListener("pact:nudge-done", (e) => {
  if ($("try-result").hidden) return;
  $("try-result-title").textContent = e.detail.outcome === "cancel" ? "❌ You cancelled it" : "✅ You chose to buy it";
});

function payCustom(purchase) {
  const result = handlePurchase({ id: "custom", ...purchase });
  showTryResult(result.action, result.reason);
}

// One-click examples. Results depend on the uploaded statement.
const TRY_EXAMPLES = [
  { text: "🛒 Tesco £40 at 2am", shop: "Tesco", amount: 40, category: "groceries", time: "02:00" },
  { text: "🍔 Deliveroo £100", shop: "Deliveroo", amount: 100, category: "takeaway", time: "20:00" },
  { text: "👟 JD Sports £120", shop: "JD Sports", amount: 120, category: "clothes", time: "15:00" },
  { text: "🛍️ ASOS £90 at 1:30am", shop: "ASOS", amount: 90, category: "clothes", time: "01:30" },
  { text: "📺 Currys £300", shop: "Currys", amount: 300, category: "electronics", time: "14:00" },
];
$("try-examples").replaceChildren(...TRY_EXAMPLES.map(({ text, ...purchase }) =>
  button(text, "preset", () => {
    $("custom-shop").value = purchase.shop;
    $("custom-amount").value = purchase.amount;
    $("custom-category").value = purchase.category;
    $("custom-time").value = purchase.time;
    $("custom-bnpl").checked = false;
    showCustomType();
    payCustom(purchase);
  })));

$("custom-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const shop = $("custom-shop").value.trim();
  const amount = Number($("custom-amount").value);
  if (!shop || !(amount > 0)) return;
  payCustom({
    shop,
    amount,
    category: $("custom-category").value,
    bnpl: $("custom-bnpl").checked,
    ...($("custom-time").value ? { time: $("custom-time").value } : {}),
  });
});

$("demo-reset").addEventListener("click", () => {
  plans = [];
  kept = 0;
  holds = [];
  activity = [];
  spent = [];
  save("pact.spent", spent);
  notifyChart({ type: "pact:purchases-changed" });
  save("pact.plans", plans);
  save("pact.kept", kept);
  save("pact.holds", holds);
  save("pact.activity", activity);
  closeHold();
  render();
  renderHolds();
  renderActivity();
  toast("Demo reset", "Everything is back to the start.");
});

renderStreak();
renderRules();
renderClock();
render();
renderHolds();
renderActivity();
setInterval(render, 250);
setInterval(renderClock, 30000);
