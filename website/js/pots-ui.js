// Pact — manual pots screen. Business rules and storage checks live in pots.js.
(() => {
  const createForm = document.getElementById("pots-create-form");
  if (!createForm) return;
  let storage;
  try { storage = localStorage; } catch { storage = null; }
  const restored = PactPots.restore(storage);
  let state = restored.state;
  const status = document.getElementById("pots-status");
  const storageNote = document.getElementById("pots-storage-note");
  storageNote.textContent = restored.warning || "Pots are saved on this browser only. No real money is moved.";

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function apply(next, message) {
    state = next;
    const saved = PactPots.persist(storage, state);
    storageNote.textContent = saved
      ? "Pots are saved on this browser only. No real money is moved."
      : "Saving is unavailable. Changes are only kept for this visit and may be lost on refresh.";
    status.textContent = message;
    render();
  }

  function potCard(pot) {
    const item = element("li", undefined, "card pots-card");
    item.dataset.potId = pot.id;
    const category = PactPots.CATEGORIES[pot.category];
    const icon = element("span", category.icon, "pots-icon");
    icon.setAttribute("aria-hidden", "true");
    const heading = element("div", undefined, "card-head");
    const title = element("div");
    title.append(element("h3", pot.name), element("p", category.label));
    heading.append(icon, title);
    item.append(heading, element("p", money(pot.balancePence / 100), "num pots-balance"));

    if (pot.targetPence !== null) {
      const progress = element("progress");
      progress.max = pot.targetPence;
      progress.value = Math.min(pot.balancePence, pot.targetPence);
      progress.setAttribute("aria-label", `${pot.name} savings progress`);
      item.append(progress, element("p", `Target: ${money(pot.targetPence / 100)} · ${Math.floor(pot.balancePence / pot.targetPence * 100)}% saved`));
      if (pot.balancePence >= pot.targetPence) item.append(element("p", "Target reached. You can keep saving.", "pots-achieved"));
    } else {
      item.append(element("p", "No target set. Save at your own pace."));
    }

    const form = element("form");
    form.setAttribute("aria-label", `Move demo money for ${pot.name}`);
    const label = element("label", "Amount (£)");
    const amount = element("input");
    amount.type = "number";
    amount.min = "0.01";
    amount.step = "0.01";
    amount.required = true;
    amount.placeholder = "e.g. 10";
    label.append(amount);
    const error = element("p", "", "pots-error");
    error.setAttribute("role", "alert");
    const actions = element("div", undefined, "actions");
    const add = element("button", "Add money");
    add.type = "submit";
    add.value = "add";
    add.disabled = state.availablePence === 0;
    const withdraw = element("button", "Take money out", "secondary");
    withdraw.type = "submit";
    withdraw.value = "withdraw";
    withdraw.disabled = pot.balancePence === 0;
    actions.append(add, withdraw);
    form.append(label, actions, error);
    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const direction = event.submitter?.value || "add";
        const next = PactPots.transfer(state, pot.id, amount.value, direction);
        apply(next, direction === "add"
          ? `${money(PactPots.toPence(amount.value) / 100)} added to ${pot.name}.`
          : `${money(PactPots.toPence(amount.value) / 100)} returned from ${pot.name} to your available demo money.`);
      } catch (problem) {
        error.textContent = problem.message;
      }
    });
    item.append(form);
    return item;
  }

  function render() {
    document.getElementById("pots-available").textContent = money(state.availablePence / 100);
    document.getElementById("pots-allocated").textContent = money((PactPots.STARTING_PENCE - state.availablePence) / 100);
    document.getElementById("pots-list").replaceChildren(...state.pots.map(potCard));
    document.getElementById("pots-empty").hidden = state.pots.length > 0;
  }

  createForm.addEventListener("submit", event => {
    event.preventDefault();
    const error = document.getElementById("pots-create-error");
    try {
      const name = document.getElementById("pots-name").value;
      const next = PactPots.createPot(state, {
        name,
        category: document.getElementById("pots-category").value,
        target: document.getElementById("pots-target").value,
      });
      apply(next, `${name.trim()} created. Choose how much demo money to add.`);
      createForm.reset();
      error.textContent = "";
    } catch (problem) {
      error.textContent = problem.message;
    }
  });

  // Keep a second open Pact tab in sync without changing other feature storage.
  window.addEventListener("storage", event => {
    if (event.key !== PactPots.STORAGE_KEY && event.key !== null) return;
    const latest = PactPots.restore(storage);
    state = latest.state;
    storageNote.textContent = latest.warning || "Pots are saved on this browser only. No real money is moved.";
    status.textContent = "Pots updated from another tab.";
    render();
  });
  render();
})();
