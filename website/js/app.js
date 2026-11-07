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
  $("home-plans").replaceChildren(...active.slice(0, 4).map((p) => planItem(p, now)));
  $("home-empty").hidden = active.length > 0;

  $("plans").replaceChildren(...plans.map((p) => planItem(p, now)));
  $("empty").hidden = plans.length > 0;

  $("hold-card").hidden = holdStatus !== "held";
  $("hold-done").hidden = holdStatus === "held";
  $("protected").textContent = money(DEMO.protectedThisMonth);
  $("kept-home").textContent = money(kept);
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
}

// ---------- Navigation ----------
const TITLES = { home: "Jordan", plan: "Plan a purchase", pact: "My Pact", alternatives: "Explore alternatives" };

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

$("hold-plan").addEventListener("click", () => {
  addPlan(DEMO.hold.item, DEMO.hold.price);
  holdStatus = "planned";
  save("pact.hold", holdStatus);
  render();
});

$("hold-cancel").addEventListener("click", () => {
  kept += DEMO.hold.price;
  holdStatus = "cancelled";
  save("pact.kept", kept);
  save("pact.hold", holdStatus);
  render();
});

$("demo-night").addEventListener("change", renderClock);

$("demo-reset").addEventListener("click", () => {
  plans = [];
  kept = 0;
  holdStatus = "held";
  save("pact.plans", plans);
  save("pact.kept", kept);
  save("pact.hold", holdStatus);
  render();
});

renderStreak();
renderRules();
renderClock();
render();
setInterval(render, 250);
setInterval(renderClock, 30000);
