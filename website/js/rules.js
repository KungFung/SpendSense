// Pact — rules engine.   OWNER: Person 3 (rules and hold screen)
//
// Given a purchase, decide what happens. Plain code only, no AI.
// Returns { action: "allow" | "nudge" | "hold", rule } for a transaction
// (see the transaction format in statement.js).
//
// Rules look like this (Person 4's AI produces them in setup.js):
// {
//   id: "late_night",
//   text: "Hold purchases over £50 between midnight and 6am",
//   conditions: { timeFrom: "00:00", timeTo: "06:00", amountOver: 50 },
//   action: "hold",
//   cooldownHours: 24
// }

function checkPurchase(transaction, rules) {
  // TODO: essentials ("need") always allowed; then check each rule.
  return { action: "allow", rule: null };
}
