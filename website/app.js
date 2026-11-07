// Pact — planned purchases with a cooling-off period.
// Everything is stored in the browser (localStorage); no backend yet.

const STORAGE_KEY = "pact.plans";
const KEPT_KEY = "pact.kept";
const HOUR_MS = 60 * 60 * 1000;
const READY_WINDOW_DAYS = 7;

// Bigger purchase → longer cooling-off (see PROJECT.md, section 2.3).
function cooldownHours(price) {
  if (price >= 500) return 72;
  if (price >= 100) return 48;
  return 24;
}

// In demo mode, 1 hour of cooling-off passes in 1 second.
function hourLength() {
  return document.getElementById("demo-mode").checked ? 1000 : HOUR_MS;
}

const load = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback));
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

let plans = load(STORAGE_KEY, []);
let kept = load(KEPT_KEY, 0);

const money = (n) => "£" + Number(n).toLocaleString("en-GB");

function formatRemaining(ms, hourMs) {
  const hours = Math.ceil(ms / hourMs);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${days}d ${rest}h left` : `${days}d left`;
  }
  return `${hours}h left`;
}

function statusOf(plan, now) {
  if (plan.status !== "cooling") return plan.status;
  if (now >= plan.expiresAt) return "expired";
  if (now >= plan.readyAt) return "ready";
  return "cooling";
}

function render() {
  const now = Date.now();
  const list = document.getElementById("plans");
  list.replaceChildren();
  document.getElementById("empty").hidden = plans.length > 0;
  document.getElementById("kept").textContent = money(kept);

  for (const plan of plans) {
    const status = statusOf(plan, now);
    const total = plan.readyAt - plan.createdAt;
    const progress = Math.min(1, (now - plan.createdAt) / total);

    const li = document.createElement("li");
    li.className = "plan " + (status === "ready" ? "ready" : status === "cooling" ? "" : "done");

    const top = document.createElement("div");
    top.className = "plan-top";
    const name = document.createElement("span");
    name.textContent = plan.item;
    const price = document.createElement("span");
    price.textContent = money(plan.price);
    top.append(name, price);

    const text = document.createElement("div");
    text.className = "plan-status";
    if (status === "cooling") {
      const halfway = progress >= 0.5 ? "Halfway there. Still want it? " : "Cooling off · ";
      text.textContent = halfway + formatRemaining(plan.readyAt - now, plan.hourMs);
    } else if (status === "ready") {
      text.textContent = `✅ Ready. You can buy it without a hold for ${READY_WINDOW_DAYS} days.`;
    } else if (status === "bought") {
      text.textContent = "Bought, planned not impulsive 👏";
    } else if (status === "cancelled") {
      text.textContent = "You changed your mind. Money kept.";
    } else {
      text.textContent = "Plan expired. Plan it again if you still want it.";
    }

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.style.width = (status === "cooling" || status === "ready" ? progress * 100 : 100) + "%";
    bar.append(fill);

    li.append(top, text, bar);

    if (status === "cooling" || status === "ready") {
      const actions = document.createElement("div");
      actions.className = "actions";
      if (status === "ready") {
        actions.append(button("Buy it", "go", () => finish(plan.id, "bought")));
      }
      actions.append(button("I don't want it anymore", "secondary", () => finish(plan.id, "cancelled")));
      li.append(actions);
    }

    list.append(li);
  }
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

function finish(id, status) {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return;
  plan.status = status;
  if (status === "cancelled") {
    kept += plan.price;
    save(KEPT_KEY, kept);
  }
  save(STORAGE_KEY, plans);
  render();
}

function updatePreview() {
  const price = Number(document.getElementById("price").value);
  document.getElementById("cooldown-preview").textContent = price > 0
    ? `Cooling-off period: ${cooldownHours(price)} hours`
    : "";
}

document.getElementById("price").addEventListener("input", updatePreview);

document.getElementById("plan-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const item = document.getElementById("item").value.trim();
  const price = Number(document.getElementById("price").value);
  if (!item || !(price > 0)) return;

  const now = Date.now();
  const hourMs = hourLength();
  const readyAt = now + cooldownHours(price) * hourMs;
  plans.unshift({
    id: crypto.randomUUID(),
    item,
    price,
    createdAt: now,
    readyAt,
    expiresAt: readyAt + READY_WINDOW_DAYS * 24 * hourMs,
    hourMs,
    status: "cooling",
  });
  save(STORAGE_KEY, plans);

  e.target.reset();
  updatePreview();
  render();
});

render();
setInterval(render, 250);
