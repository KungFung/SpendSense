// Pact — simulated pots. All money is stored as whole pennies, not decimal pounds.
// Pure functions return a new state; a rejected action never changes the old one.
// No connection to statements, payments, "money kept" or real bank balances.
const PactPots = (() => {
  const STARTING_PENCE = 20000;
  const STORAGE_KEY = "pact.pots.v1";
  const CATEGORIES = {
    essentials: { label: "Essentials", icon: "🏠" },
    emergency: { label: "Emergency fund", icon: "🛟" },
    learning: { label: "Learning & career", icon: "🌱" },
    goal: { label: "Personal goal", icon: "🎯" },
  };

  function initialState() {
    return { version: 1, availablePence: STARTING_PENCE, pots: [] };
  }

  function toPence(value) {
    const text = String(value ?? "").trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
      throw new Error("Enter an amount in pounds with up to two decimal places.");
    }
    const [pounds, pennies = ""] = text.split(".");
    const amount = Number(pounds) * 100 + Number(pennies.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount)) throw new Error("That amount is too large.");
    return amount;
  }

  function validateState(state) {
    const validMoney = value => Number.isSafeInteger(value) && value >= 0;
    if (!state || state.version !== 1 || !validMoney(state.availablePence) || !Array.isArray(state.pots)) {
      throw new Error("The saved pots data is not valid.");
    }
    const ids = new Set();
    const names = new Set();
    let total = state.availablePence;
    for (const pot of state.pots) {
      if (!pot || typeof pot.id !== "string" || !pot.id || ids.has(pot.id) ||
          typeof pot.name !== "string" || !pot.name.trim() || pot.name.length > 40 ||
          names.has(pot.name.trim().toLowerCase()) || !Object.hasOwn(CATEGORIES, pot.category) ||
          !validMoney(pot.balancePence) ||
          !(pot.targetPence === null || (Number.isSafeInteger(pot.targetPence) && pot.targetPence > 0))) {
        throw new Error("The saved pots data is not valid.");
      }
      ids.add(pot.id);
      names.add(pot.name.trim().toLowerCase());
      total += pot.balancePence;
    }
    if (total !== STARTING_PENCE) throw new Error("Pots and available money must total £200 in this demo.");
    return state;
  }

  function createPot(state, { name, category, target = "" }, id = globalThis.crypto?.randomUUID?.() ?? `pot-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
    validateState(state);
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (!cleanName || cleanName.length > 40) throw new Error("Give your pot a name between 1 and 40 characters.");
    if (state.pots.some(pot => pot.name.trim().toLowerCase() === cleanName.toLowerCase())) {
      throw new Error("You already have a pot with that name. Choose a different name.");
    }
    if (!Object.hasOwn(CATEGORIES, category)) throw new Error("Choose a pot category.");
    const targetPence = String(target).trim() === "" ? null : toPence(target);
    if (targetPence === 0) throw new Error("Enter a target above £0, or leave it blank.");
    return validateState({ ...state, pots: [...state.pots, { id, name: cleanName, category, targetPence, balancePence: 0 }] });
  }

  // direction: "add" moves available money into the pot; "withdraw" returns it.
  function transfer(state, potId, pounds, direction) {
    validateState(state);
    const pot = state.pots.find(item => item.id === potId);
    if (!pot) throw new Error("That pot could not be found.");
    if (!["add", "withdraw"].includes(direction)) throw new Error("Choose add money or take money out.");
    const amount = toPence(pounds);
    if (amount === 0) throw new Error("Enter an amount above £0.");
    if (direction === "add" && amount > state.availablePence) throw new Error("There isn't enough available demo money.");
    if (direction === "withdraw" && amount > pot.balancePence) throw new Error("There isn't that much money in this pot.");
    const delta = direction === "add" ? amount : -amount;
    return validateState({
      ...state,
      availablePence: state.availablePence - delta,
      pots: state.pots.map(item => item.id === potId ? { ...item, balancePence: item.balancePence + delta } : item),
    });
  }

  // Storage is injected so tests and teammates can use the logic without a browser.
  function restore(storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return { state: raw === null ? initialState() : validateState(JSON.parse(raw)), warning: "" };
    } catch {
      return {
        state: initialState(),
        warning: "Saved pots couldn't be loaded. Showing a fresh £200 demo; your next change will try to save it.",
      };
    }
  }

  function persist(storage, state) {
    validateState(state);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  return { STARTING_PENCE, STORAGE_KEY, CATEGORIES, initialState, toPence, validateState, createPot, transfer, restore, persist };
})();
