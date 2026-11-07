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

// "That's 4× your usual takeaway (£18)." from compareToUsual() in statement.js.
const usualText = (u) => (u ? `That's ${Math.round(u.times)}× your usual ${u.what} (${money(u.usual)}).` : "");

function checkPurchase(tx) {
  const hour = new Date(tx.date).getHours();

  // 1. Essentials are never held. Need or want comes from our classifier (statement.js),
  //    not from a label typed into the purchase.
  const label = labelPurchase(tx);
  if (label.type === "need") {
    return { action: "allow", reason: `Essentials are never held (${label.group}).` };
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

  // How this compares with the user's own spending (from their statement). null if it's normal for them.
  const unusual = compareToUsual(tx);

  // 3. Late at night.
  if (hour < 6 && tx.amount > 50) {
    return { action: "hold", rule: ruleById("late_night"), reason: usualText(unusual) };
  }

  // 4. Third buy-now-pay-later plan (counted from the demo log; the real
  //    version should count BNPL payments in the statement for this week).
  if (tx.bnpl) {
    const earlierBnpl = activity.filter((a) => a.bnpl && a.action !== "hold").length;
    if (earlierBnpl >= 2) {
      return { action: "hold", rule: ruleById("bnpl_stack"), reason: `This would be buy-now-pay-later plan number ${earlierBnpl + 1}.` };
    }
  }

  // 5. Big purchase that wasn't planned.
  if (tx.amount >= 150) {
    return {
      action: "hold",
      rule: ruleById("big_purchase"),
      reason: `${usualText(unusual)} Plan it first: after a short cooling-off it goes straight through.`.trim(),
    };
  }

  // 6. Much bigger than this person usually spends on this kind of thing: a nudge, not a hold.
  if (unusual) {
    return {
      action: "nudge",
      rule: unusual.what === "takeaway" ? ruleById("takeaways") : { text: "Much bigger than your usual" },
      reason: usualText(unusual),
    };
  }

  return { action: "allow", reason: "Within your pact." };
}
