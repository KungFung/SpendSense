// Pact — bank statement upload.   OWNER: Person 2 (statement upload)
//
// The user uploads their own CSV. We read it in the browser (it never leaves the computer),
// label every transaction need / want / unsure / income, learn what's "usual" for this person,
// and flag spending that might be impulsive.
//
// All the logic is the SAME code as `npm run classify`: js/classifier/keywords.js,
// classifier.js, impulse.js and csvLoader.js, loaded before this file in index.html.
// To fix a shop that's labelled wrongly, edit website/js/classifier/keywords.js (one place for both).
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

// A live purchase this many times the user's usual gets a nudge ("Still want it?").
// Lower than the 3x used for statement warnings (impulse.js), because a nudge is gentle:
// one tap and it goes through. E.g. usual takeaway £30 → a £80 takeaway (2.7x) is nudged.
const NUDGE_MULTIPLE = 2.5;

// Is this purchase much bigger than usual? At least NUDGE_MULTIPLE x usual, and at least £30
// (impulse.js SETTINGS.bigWantMinimum, so £9 vs £3 isn't flagged). Needs are never compared.
function compareToUsual(tx) {
  const label = labelPurchase(tx);
  if (label.type === "need") return null;
  const usual = usualSpend(label.group);
  if (!usual || !(usual.amount > 0)) return null;
  const times = tx.amount / usual.amount;
  if (tx.amount < SpendSense.SETTINGS.bigWantMinimum || times < NUDGE_MULTIPLE) return null;
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

// ---------- "Needs & wants" page: every payment with its label ----------
const LABEL_TEXT = { need: "Need", want: "Want", unsure: "Not sure" };
let statementFilter = "all";

// "2026-09-12" → "12 Sep"
const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// A readable name from the bank's text:
//   "'7658 20Aug26 C , ASOS.COM , GB"         → "Asos.com"       (card payment: the middle part)
//   "'T BROWN , DINNER , VIA MOBILE - PYMT"   → "T Brown · dinner" (paid a person)
//   "'GLASGOW CITY COUN"                      → "Glasgow City Coun"
function displayName(t) {
  if (t.group === "cash withdrawal") return "Cash machine";
  const parts = String(t.description || "").replace(/^'/, "").split(",").map((p) => p.trim());
  let name = parts.length >= 3 && /\d\d[A-Za-z]{3}\d\d C$/.test(parts[0]) ? parts[1]
    : parts.length >= 3 ? `${parts[0]} · ${parts[1].toLowerCase()}`
    : parts[0];
  name = name.split(/\s+/).filter((w) => !/\d/.test(w)).join(" ").replace(/\*.*$/, "").trim(); // drop store numbers and refs
  // Title case, but keep short names like "EE", "TK" and "H&M" in capitals.
  return name.replace(/[A-Za-z&.]+/g, (w) =>
    w.length <= 2 || w.includes("&") || w !== w.toUpperCase() ? w : w[0] + w.slice(1).toLowerCase()) || "Unknown";
}

// A plain-English "why" for each label.
const nice = (group) => group.replace(/\//g, " / ").replace(/^./, (c) => c.toUpperCase());
function whyText(t) {
  if (t.source === "you") return "You chose this";
  if (t.label === "unsure") return t.group ? `${nice(t.group)}: could be either, you decide` : "We don't know this one yet, you decide";
  return t.group ? nice(t.group) : t.reason;
}

function renderStatementPage() {
  const results = $("ss-results");
  if (!results) return;
  results.hidden = !statement;
  $("ss-empty").hidden = Boolean(statement);
  $("statement-upload-page").textContent = statement ? "📄 Upload a different statement" : "📄 Upload a statement";
  if (!statement) return;

  const spending = statement.classified.filter((t) => t.label !== "income");
  for (const label of ["need", "want", "unsure"]) {
    const list = spending.filter((t) => t.label === label);
    $(`ss-${label}`).textContent = money(Math.round(list.reduce((sum, t) => sum - t.amount, 0) * 100) / 100);
    $(`ss-${label}-n`).textContent = `${list.length} payments`;
  }

  // Which payments the impulse checks flagged, with a short reason.
  const flagged = new Map();
  statement.flags.forEach((f) => f.transactions.forEach((t) => flagged.set(t.date + t.description, firstSentence(f.message))));

  document.querySelectorAll("#ss-filters button").forEach((b) => b.classList.toggle("active", b.dataset.filter === statementFilter));
  const shown = spending.filter((t) => statementFilter === "all" || t.label === statementFilter);

  $("ss-rows").replaceChildren(...shown.map((t) => {
    const tr = document.createElement("tr");
    const cell = (text, className) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (className) td.className = className;
      tr.append(td);
      return td;
    };
    cell(shortDate(t.date));
    cell(displayName(t)).title = t.description; // full bank text on hover
    cell(money(-t.amount), "ss-amount num");

    const labelCell = cell("");
    const pill = document.createElement("span");
    pill.className = "pill " + t.label;
    pill.textContent = LABEL_TEXT[t.label];
    labelCell.append(pill);
    if (t.label === "unsure") {
      // The user decides: tap Need or Want.
      const pick = document.createElement("div");
      pick.className = "ss-pick";
      pick.append(
        button("Need", "", () => setLabel(t, "need")),
        button("Want", "", () => setLabel(t, "want")));
      labelCell.append(pick);
    }

    const why = cell(whyText(t), "ss-why");
    const flag = flagged.get(t.date + t.description);
    if (flag) {
      const note = document.createElement("span");
      note.className = "ss-flag";
      note.textContent = "⚠️ " + flag;
      why.append(note);
    }
    return tr;
  }));
}

// The user's own answer wins, and it changes their "usual" spending too.
function setLabel(t, label) {
  t.label = label;
  t.source = "you";
  t.confidence = 1;
  statement.flags = SpendSense.detectImpulseSpending(statement.classified);
  save("pact.statement", statement);
  buildTransactions();
  renderStatement();
  renderStatementPage();
}

document.querySelectorAll("#ss-filters button").forEach((b) => b.addEventListener("click", () => {
  statementFilter = b.dataset.filter;
  renderStatementPage();
}));

// ---------- Upload buttons (dashboard and the Needs & wants page) ----------
$("statement-upload")?.addEventListener("click", () => $("statement-file").click());
$("statement-upload-page")?.addEventListener("click", () => $("statement-file").click());
$("statement-file")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) {
    useStatement(file.name, await file.text());
    renderStatementPage();
    if (statement) showTab("statement"); // go straight to the labelled list
  }
  e.target.value = ""; // so the same file can be chosen again
});

buildTransactions();
renderStatement();
renderStatementPage();
