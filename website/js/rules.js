// Pact — rules engine.   OWNER: Person 3 (rules and hold screen)
//
// BASIC VERSION written for the demo. Replace it with the full engine, but keep
// checkPurchase(tx) returning { action, rule, reason, plan } so app.js keeps working.
//
// Given a purchase, decide what happens. Plain code only, no AI.
// action: "allow" | "nudge" | "hold"
//
// Rules look like this (Person 4's AI produces them in setup.js):
// {
//   id: "late_night",
//   text: "Hold purchases over £50 between midnight and 6am",
//   conditions: { timeFrom: "00:00", timeTo: "06:00", amountOver: 50 },
//   action: "hold",
//   cooldownHours: 24
// }

const ruleById = (id) => DEMO.rules.find((r) => r.id === id);

function checkPurchase(tx) {
  const hour = new Date(tx.date).getHours();

  // 1. Essentials are never held.
  if (tx.type === "need") {
    return { action: "allow", reason: "Essentials are never held." };
  }

  // 2. Planned purchases: through once cooled off, held while still cooling.
  const plan = matchingPlan(tx);
  if (plan) {
    const now = Date.now();
    if (statusOf(plan, now) === "ready") {
      return { action: "allow", plan, reason: "You planned this and waited. Enjoy it." };
    }
    return {
      action: "hold",
      plan,
      rule: { text: `You planned "${plan.item}" and it's still cooling off` },
      reason: `Nearly there: ${formatRemaining(plan.readyAt - now, plan.hourMs)}.`,
    };
  }

  // 3. Late at night.
  if (hour < 6 && tx.amount > 50) {
    return { action: "hold", rule: ruleById("late_night") };
  }

  // 4. Big purchase that wasn't planned.
  if (tx.amount >= 150) {
    return {
      action: "hold",
      rule: ruleById("big_purchase"),
      reason: "Plan it first: after a short cooling-off it goes straight through.",
    };
  }

  // 5. Unusually big takeaway.
  if (tx.category === "takeaway" && tx.amount > 3 * DEMO.usualTakeaway) {
    const times = Math.round(tx.amount / DEMO.usualTakeaway);
    return {
      action: "nudge",
      rule: ruleById("takeaways"),
      reason: `That's ${times}× your usual takeaway (${money(DEMO.usualTakeaway)}).`,
    };
  }

  return { action: "allow", reason: "Within your pact." };
}
