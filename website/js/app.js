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
const TITLES = { home: "Jordan", plan: "Plan a purchase", pact: "My Pact" };

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
    toast(`💬 ${label}: nudge`, `${decision.reason} It went through; your pact just checked in.`);
  } else {
    if (decision.plan) finish(decision.plan.id, "bought");
    toast(`✅ ${label}: approved`, decision.reason);
  }
  return { action: decision.action, reason: decision.reason ?? "" };
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

// ---------- Demo panel ----------
$("demo-toggle").addEventListener("click", () => { $("demo-panel").hidden = !$("demo-panel").hidden; });
$("demo-night").addEventListener("change", renderClock);
$("open-shop").addEventListener("click", () => {
  window.open("shop.html", "pact-shop", "width=560,height=780");
});

$("presets").replaceChildren(...DEMO.purchases.map((p) =>
  button(p.label, "preset", () => handlePurchase(p))));

$("demo-reset").addEventListener("click", () => {
  plans = [];
  kept = 0;
  holds = [];
  save("pact.plans", plans);
  save("pact.kept", kept);
  save("pact.holds", holds);
  closeHold();
  render();
  renderHolds();
});

renderStreak();
renderRules();
renderClock();
render();
renderHolds();
setInterval(render, 250);
setInterval(renderClock, 30000);
