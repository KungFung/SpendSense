// Pact — planned purchases with a cooling-off period.

// ---------- Cooling-off rules (PROJECT.md, section 2.3) ----------
function cooldownHours(price) {
  if (price >= 500) return 72;
  if (price >= 100) return 48;
  return 24;
}

function hourLength() {
  return $("demo-mode").checked ? 1000 : HOUR_MS;
}

function addPlan(item, price) {
  const now = Date.now();
  const hourMs = hourLength();
  const readyAt = now + cooldownHours(price) * hourMs;
  plans.unshift({
    id: now.toString(36) + Math.random().toString(36).slice(2),
    item,
    price,
    createdAt: now,
    readyAt,
    expiresAt: readyAt + READY_WINDOW_DAYS * 24 * hourMs,
    hourMs,
    status: "cooling",
  });
  save("pact.plans", plans);
}

function statusOf(plan, now) {
  if (plan.status !== "cooling") return plan.status;
  if (now >= plan.expiresAt) return "expired";
  if (now >= plan.readyAt) return "ready";
  return "cooling";
}

function formatRemaining(ms, hourMs) {
  const hours = Math.ceil(ms / hourMs);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rest = hours % 24;
    return rest ? `${days}d ${rest}h left` : `${days}d left`;
  }
  return `${hours}h left`;
}

// A purchase matches a plan if it's the same thing (PROJECT.md 2.3: "same shop") and the amount
// is within 10% of the planned price. Same thing = a word in common, so a plan for "TV" matches
// "Currys TV", but a plan for "Headphones £70" no longer lets any £70 purchase (Deliveroo) through.
const nameWords = (text) => new Set(String(text).toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 2));
function sameThing(planItem, shop) {
  const shopWords = nameWords(shop);
  return [...nameWords(planItem)].some((w) => shopWords.has(w));
}

function matchingPlan(tx) {
  const now = Date.now();
  return plans.find((p) =>
    ["cooling", "ready"].includes(statusOf(p, now)) &&
    sameThing(p.item, tx.shop) &&
    Math.abs(p.price - tx.amount) <= p.price * 0.1);
}

function finish(id, status) {
  const plan = plans.find((p) => p.id === id);
  if (!plan) return;
  plan.status = status;
  if (status === "cancelled") {
    kept += plan.price;
    save("pact.kept", kept);
  }
  save("pact.plans", plans);
  render();
}

function button(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

// ---------- Plan cards ----------
// Cards are rebuilt only when a plan's status changes; the countdown and bar are
// updated in place, so buttons aren't replaced while someone is clicking them.
function buildPlanItem(plan, status) {
  const li = document.createElement("li");
  li.className = "plan " + (status === "ready" ? "ready" : status === "cooling" ? "" : "done");

  const top = document.createElement("div");
  top.className = "plan-top";
  const name = document.createElement("span");
  name.textContent = plan.item;
  const price = document.createElement("span");
  price.className = "num";
  price.textContent = money(plan.price);
  top.append(name, price);

  const text = document.createElement("div");
  text.className = "plan-status";

  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("div");
  bar.append(fill);

  li.append(top, text, bar);

  if (status === "cooling" || status === "ready") {
    const actions = document.createElement("div");
    actions.className = "actions";
    if (status === "ready") {
      actions.append(button("Buy it", "go", () => {
        finish(plan.id, "bought");
        recordSpend(plan.item, plan.price, demoNow(), { preApproved: true });
      }));
    }
    actions.append(button("I don't want it anymore", "secondary", () => finish(plan.id, "cancelled")));
    li.append(actions);
  }
  return { li, status, text, fill };
}

function updatePlanItem(node, plan, status, now) {
  const progress = Math.min(1, (now - plan.createdAt) / (plan.readyAt - plan.createdAt));
  let text;
  if (status === "cooling") {
    const prefix = progress >= 0.5 ? "Halfway there. Still want it? " : "Cooling off · ";
    text = prefix + formatRemaining(plan.readyAt - now, plan.hourMs);
  } else if (status === "ready") {
    text = `✅ Ready. You can buy it without a hold for ${READY_WINDOW_DAYS} days.`;
  } else if (status === "bought") {
    text = "Bought, planned not impulsive 👏";
  } else if (status === "cancelled") {
    text = "You changed your mind. Money kept.";
  } else {
    text = "Plan expired. Plan it again if you still want it.";
  }
  if (node.text.textContent !== text) node.text.textContent = text;
  node.fill.style.width = (status === "cooling" || status === "ready" ? progress * 100 : 100) + "%";
}

const planNodes = new Map(); // list element → Map(plan id → card)

function syncPlanList(ul, list, now) {
  if (!planNodes.has(ul)) planNodes.set(ul, new Map());
  const nodes = planNodes.get(ul);

  const wanted = list.map((plan) => {
    const status = statusOf(plan, now);
    let node = nodes.get(plan.id);
    if (!node || node.status !== status) {
      node = buildPlanItem(plan, status);
      nodes.set(plan.id, node);
    }
    updatePlanItem(node, plan, status, now);
    return node.li;
  });

  const ids = new Set(list.map((p) => p.id));
  for (const id of nodes.keys()) if (!ids.has(id)) nodes.delete(id);

  const current = [...ul.children];
  if (current.length !== wanted.length || current.some((el, i) => el !== wanted[i])) {
    ul.replaceChildren(...wanted);
  }
}
