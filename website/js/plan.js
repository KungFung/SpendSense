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

function planItem(plan, now) {
  const status = statusOf(plan, now);
  const progress = Math.min(1, (now - plan.createdAt) / (plan.readyAt - plan.createdAt));

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
    const prefix = progress >= 0.5 ? "Halfway there. Still want it? " : "Cooling off · ";
    text.textContent = prefix + formatRemaining(plan.readyAt - now, plan.hourMs);
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
    if (status === "ready") actions.append(button("Buy it", "go", () => finish(plan.id, "bought")));
    actions.append(button("I don't want it anymore", "secondary", () => finish(plan.id, "cancelled")));
    li.append(actions);
  }
  return li;
}
