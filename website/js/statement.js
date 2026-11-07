// Pact — bank statement upload.   OWNER: Person 2 (statement upload)
//
// The user uploads their own CSV. We read it in the browser (it never leaves the computer),
// label every transaction need / want / unsure / income, learn what's "usual" for this person,
// and flag spending that might be impulsive.
//
// All the logic is the SAME code as `npm run classify`: src/classifier/keywords.js,
// classifier.js, impulse.js and csvLoader.js, loaded before this file in index.html.
// To fix a shop that's labelled wrongly, edit src/classifier/keywords.js (one place for both).
//
// What other files can use:
//   labelPurchase(tx)    → { type: "need" | "want" | "unsure", group, reason }   (rules.js)
//   compareToUsual(tx)   → { times, usual, what, fromStatement } or null          (rules.js)
//   transactions         → the user's statement in the shape below                (streak.js etc.)
// {
//   date: "2026-10-31",
//   shop: "Asos",
//   amount: 34,                    // money out, as a positive number
//   category: "fashion",           // the shop type our keyword list found, or null
//   type: "want",                  // "need" | "want" | "unsure" (income isn't in this list)
//   impulseScore: 1,               // how many impulse checks flagged it (0 to 3)
//   reasons: ["About 4x your usual want purchase (£8.50)"]
// }
//
// Until a statement is uploaded, Pact falls back to the demo numbers in core.js.
// The user's own statement always wins.

let statement = load("pact.statement", null); // { fileName, loadedAt, classified, flags }
let transactions = [];

// ---------- Need or want, for one purchase ----------
// Purchases from the shop/demo panel look like { shop: "Deliveroo", amount: 80.2, category: "takeaway" }.
// We ignore any "type" already on the purchase: our keyword rules decide.
function labelPurchase(tx) {
  const result = SpendSense.classifyByRules({
    description: tx.shop,
    amount: -Math.abs(tx.amount), // the classifier expects money out to be negative
    type: "expense",
    category: tx.category || null,
  });
  return { type: result.label, group: result.group, reason: result.reason };
}

// ---------- What's "usual" for this person ----------
const wantsInStatement = () =>
  (statement?.classified || []).filter((t) =>
    t.label === "want" && t.amount < 0 && !SpendSense.NOT_IMPULSIVE_GROUPS.includes(t.group));

// "fast food/takeaway" → "takeaway", "fashion" → "fashion spend" (reads as "your usual fashion spend")
function groupName(group) {
  const name = (group || "want").split("/").pop();
  return name === "takeaway" ? name : name + " spend";
}

// The typical (median) amount this person spends: for this kind of shop if we've seen
// at least 3, otherwise for any want. null if there isn't enough history.
function usualSpend(group) {
  const wants = wantsInStatement();
  const sameKind = wants.filter((t) => t.group === group);
  if (sameKind.length >= 3) {
    return { amount: SpendSense.median(sameKind.map((t) => -t.amount)), what: groupName(group), fromStatement: true };
  }
  if (wants.length >= SpendSense.SETTINGS.minWantsForBaseline) {
    return { amount: SpendSense.median(wants.map((t) => -t.amount)), what: "want purchase", fromStatement: true };
  }
  // No statement yet: the demo's takeaway number, so the demo still works before an upload.
  if (!statement && group === "fast food/takeaway") {
    return { amount: DEMO.usualTakeaway, what: "takeaway", fromStatement: false };
  }
  return null;
}

// Is this purchase much bigger than usual? Same thresholds as the statement check
// (impulse.js SETTINGS: 3x usual and at least £30). Needs are never compared.
function compareToUsual(tx) {
  const label = labelPurchase(tx);
  if (label.type === "need") return null;
  const usual = usualSpend(label.group);
  if (!usual || !(usual.amount > 0)) return null;
  const times = tx.amount / usual.amount;
  const { bigWantMultiple, bigWantMinimum } = SpendSense.SETTINGS;
  if (tx.amount < bigWantMinimum || times < bigWantMultiple) return null;
  return { times, usual: usual.amount, what: usual.what, fromStatement: usual.fromStatement };
}

// ---------- Upload ----------
function useStatement(fileName, csvText) {
  const parsed = SpendSense.parseStatementCsv(csvText).filter((t) => t.date && Number.isFinite(t.amount));
  if (parsed.length === 0) {
    toast("📄 Couldn't read that file", "Pact needs a CSV with Date, Description and Amount (or Value) columns.");
    return;
  }
  const classified = parsed.map(SpendSense.classifyByRules);
  const flags = SpendSense.detectImpulseSpending(classified);
  statement = { fileName, loadedAt: Date.now(), classified, flags };
  save("pact.statement", statement);
  buildTransactions();
  renderStatement();

  const count = (label) => classified.filter((t) => t.label === label).length;
  toast(`📄 ${fileName} loaded`,
    `${parsed.length} transactions: ${count("need")} needs, ${count("want")} wants, ${count("unsure")} unsure. ` +
    "Pact now uses your own spending to decide what's unusual.");
}

// The shared transactions list (shape at the top of this file).
function buildTransactions() {
  const flagged = new Map(); // description+date → reasons
  (statement?.flags || []).forEach((flag) => flag.transactions.forEach((t) => {
    const key = t.date + t.description;
    flagged.set(key, [...(flagged.get(key) || []), firstSentence(flag.message)]);
  }));

  transactions = (statement?.classified || [])
    .filter((t) => t.label !== "income")
    .map((t) => {
      const reasons = flagged.get(t.date + t.description) || [];
      return {
        date: t.date,
        shop: SpendSense.shortName(t.description),
        amount: Math.abs(t.amount),
        category: t.group,
        type: t.label,
        impulseScore: reasons.length,
        reasons,
      };
    });
}

const firstSentence = (text) => text.split(". ")[0] + ".";

// ---------- Dashboard ----------
function renderStatement() {
  const card = $("statement-card");
  if (!card) return;
  card.hidden = !statement;
  $("statement-label").textContent = statement ? "Upload a different statement" : "Upload a statement";
  if (!statement) return;

  const c = statement.classified;
  const total = (label) => money(c.filter((t) => t.label === label).reduce((sum, t) => sum + Math.abs(t.amount), 0));
  const usual = usualSpend(null);
  $("statement-summary").textContent =
    `${statement.fileName}: needs ${total("need")} · wants ${total("want")} · unsure ${total("unsure")}` +
    (usual ? ` · your usual want is ${money(Math.round(usual.amount * 100) / 100)}` : "");

  const flags = statement.flags.slice(-3).reverse(); // the most recent three
  $("statement-flags").replaceChildren(...(flags.length ? flags : [{ message: "Nothing stood out. Nice!" }]).map((f) => {
    const li = document.createElement("li");
    const p = document.createElement("p");
    p.textContent = f.message;
    li.append(p);
    return li;
  }));
}

$("statement-upload")?.addEventListener("click", () => $("statement-file").click());
$("statement-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) useStatement(file.name, await file.text());
  e.target.value = ""; // so the same file can be chosen again
});

buildTransactions();
renderStatement();
