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
// Order: 1. our keyword + category rules  2. what the AI or the user decided for the same shop in
// their statement (e.g. AI said Boots = need)  3. a "type" the purchase already carries  4. unsure.
function labelPurchase(tx) {
  const result = SpendSense.classifyByRules({
    description: tx.shop,
    amount: -Math.abs(tx.amount), // the classifier expects money out to be negative
    type: "expense",
    category: tx.category || null,
  });
  if (result.label !== "unsure") return { type: result.label, group: result.group, reason: result.reason };

  const learned = learnedLabel(tx.shop);
  if (learned) return { type: learned.label, group: result.group, reason: learned.reason, learned: true };

  if (tx.type === "need" || tx.type === "want") {
    return { type: tx.type, group: result.group, reason: `Marked as a ${tx.type}` };
  }
  return { type: "unsure", group: result.group, reason: result.reason };
}

// The label the AI or the user gave this shop in the uploaded statement (most common one), or null.
function learnedLabel(shop) {
  const key = SpendSense.findKeyword(shop)?.keyword || SpendSense.normalise(shop);
  const votes = { need: 0, want: 0 };
  (statement?.classified || []).forEach((t) => {
    if (!["ai", "you"].includes(t.source) || !(t.label in votes)) return;
    const theirs = SpendSense.findKeyword(t.description)?.keyword || SpendSense.normalise(t.description);
    if (theirs === key) votes[t.label] += 1;
  });
  if (votes.need === votes.want) return null;
  const label = votes.need > votes.want ? "need" : "want";
  return { label, reason: `Learned from your statement: usually a ${label}` };
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
// one tap and it goes through. E.g. usual takeaway £30 → a £70 takeaway (2.3x) is nudged.
const NUDGE_MULTIPLE = 2;

// Is this purchase much bigger than usual? At least NUDGE_MULTIPLE x usual, and at least £30
// (impulse.js SETTINGS.bigWantMinimum, so £9 vs £3 isn't flagged). Needs are never compared.
function compareToUsual(tx) {
  const c = compareWithUsual(tx);
  if (!c || tx.amount < SpendSense.SETTINGS.bigWantMinimum || c.times < NUDGE_MULTIPLE) return null;
  return c;
}

// The same comparison with no threshold, so an approval can say why it was fine
// ("1.7× your usual takeaway"). null for needs or when there's no history.
function compareWithUsual(tx) {
  const label = labelPurchase(tx);
  if (label.type === "need") return null;
  const usual = usualSpend(label.group);
  if (!usual || !(usual.amount > 0)) return null;
  return { times: tx.amount / usual.amount, usual: usual.amount, what: usual.what, fromStatement: usual.fromStatement };
}

// ---------- Upload ----------
function useStatement(fileName, csvText) {
  const parsed = SpendSense.parseStatementCsv(csvText).filter((t) => t.date && Number.isFinite(t.amount));
  if (parsed.length === 0) {
    toast("📄 Couldn't read that file", "SpendSense needs a CSV with Date, Description and Amount (or Value) columns.");
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
    `${parsed.length} transactions read. ` +
    (count("unsure") ? `The AI is checking ${count("unsure")} that our rules couldn't place.` : "SpendSense now uses your own spending to decide what's unusual."));
  if (typeof notifyChart === "function") notifyChart({ type: "pact:statement-changed" });
  askAiAboutUnsure();
}

// ---------- AI decides the ones our rules can't ----------
// Sends ONLY those payments' description + amount to the small helper inside `npm run dev`
// (vite.config.mjs), which asks Gemini with the key in .env. The key never reaches this page.
// The AI must answer need or want. If it can't be reached (file opened from disk, no key,
// Gemini busy), Pact treats the payment as a want, the safe choice, and says so on that row.
let aiChecking = false; // true while the AI is looking: those rows show "AI is checking…"
let aiNote = "";        // one short line, only when the AI couldn't help

async function askAiAboutUnsure() {
  const unsure = statement.classified.filter((t) => t.label === "unsure");
  if (unsure.length === 0) return;
  if (!location.protocol.startsWith("http")) {
    return guessWants(unsure, "Treated as a want for now: the AI works when SpendSense runs with npm run dev.");
  }
  const forStatement = statement;
  aiChecking = true;
  aiNote = "";
  renderStatementPage();
  try {
    const response = await fetch("api/classify-unsure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: unsure.map((t) => ({ description: t.description, amount: t.amount })) }),
    });
    const { ai, answers = [] } = await response.json();
    if (statement !== forStatement) return; // a different file was uploaded meanwhile
    aiChecking = false;
    if (ai === "off") return guessWants(unsure, "Treated as a want: the AI is off (no GEMINI_API_KEY in .env).");
    if (ai !== "ok") return guessWants(unsure, "Treated as a want: the AI was busy. Upload again to retry.");

    answers.forEach((a) => {
      const t = unsure[a.id];
      if (!t || t.label !== "unsure" || !["need", "want"].includes(a.label)) return;
      Object.assign(t, { label: a.label, source: "ai", reason: a.reason, confidence: a.confidence });
    });
    // Anything the AI skipped still gets an answer.
    guessWants(unsure.filter((t) => t.label === "unsure"), "Treated as a want: the AI didn't answer for this one.", true);
    const needs = unsure.filter((t) => t.label === "need").length;
    toast("🤖 AI checked your payments", `${unsure.length} payments our rules couldn't place: ${needs} needs, ${unsure.length - needs} wants.`);
  } catch {
    if (statement !== forStatement) return;
    aiChecking = false;
    guessWants(unsure, "Treated as a want: the AI isn't reachable right now.");
  }
}

// The safe fallback: count it as a want (wants are checked against the user's rules; needs never are).
function guessWants(list, reason, quiet) {
  list.forEach((t) => Object.assign(t, { label: "want", source: "guess", reason, confidence: 0.5 }));
  const why = reason.replace(/^Treated as a want[^:]*: /, "");
  if (list.length && !quiet) aiNote = `🤖 ${list.length} payments are treated as wants for now. ${why[0].toUpperCase()}${why.slice(1)}`;
  statementChanged();
}

// Recalculate, save, and redraw everything that uses the statement (list, totals, chart).
function statementChanged() {
  statement.flags = SpendSense.detectImpulseSpending(statement.classified);
  save("pact.statement", statement);
  buildTransactions();
  renderStatement();
  renderStatementPage();
  if (typeof notifyChart === "function") notifyChart({ type: "pact:statement-changed" });
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
const LABEL_TEXT = { need: "Need", want: "Want", unsure: "Checking" };
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
  if (t.source === "ai") return `🤖 AI: ${t.reason}`;
  if (t.source === "guess") return t.reason;
  return t.group ? nice(t.group) : t.reason;
}

// "Big purchases": wants the impulse check found much bigger than this person's usual
// (impulse.js big_want: 3x their usual want and at least £30). The chart uses the same list.
const paymentKey = (t) => `${t.date}|${t.description}|${t.amount}`;
function bigPurchaseKeys() {
  return new Set((statement?.flags || []).filter((f) => f.type === "big_want")
    .flatMap((f) => f.transactions.map(paymentKey)));
}

function renderStatementPage() {
  const results = $("ss-results");
  if (!results) return;
  results.hidden = !statement;
  $("ss-empty").hidden = Boolean(statement);
  $("ss-ai").textContent = aiNote;
  $("ss-ai").hidden = !statement || !aiNote || aiChecking;
  $("statement-upload-page").textContent = statement ? "📄 Upload a different statement" : "📄 Upload a statement";
  if (!statement) return;

  const spending = statement.classified.filter((t) => t.label !== "income");
  const big = bigPurchaseKeys();
  const isBig = (t) => big.has(paymentKey(t));
  const total = (list) => money(Math.round(list.reduce((sum, t) => sum - t.amount, 0) * 100) / 100);
  const checking = spending.filter((t) => t.label === "unsure");
  for (const label of ["need", "want"]) {
    const list = spending.filter((t) => t.label === label);
    $(`ss-${label}`).textContent = total(list);
    $(`ss-${label}-n`).textContent = `${list.length} payments` + (aiChecking && checking.length && label === "want" ? ` · AI checking ${checking.length} more` : "");
  }
  const bigList = spending.filter(isBig);
  $("ss-big").textContent = total(bigList);
  $("ss-big-n").textContent = bigList.length ? `${bigList.length} much bigger than your usual` : "None stood out";

  // Which payments the impulse checks flagged, with a short reason.
  const flagged = new Map();
  statement.flags.forEach((f) => f.transactions.forEach((t) => flagged.set(t.date + t.description, firstSentence(f.message))));

  document.querySelectorAll("#ss-filters button").forEach((b) => b.classList.toggle("active", b.dataset.filter === statementFilter));
  const shown = spending.filter((t) =>
    statementFilter === "all" ||
    (statementFilter === "big" ? isBig(t) : t.label === statementFilter || (statementFilter === "want" && t.label === "unsure")));

  $("ss-rows").replaceChildren(...shown.map((t) => {
    const tr = document.createElement("tr");
    const cell = (text, className) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (className) td.className = className;
      tr.append(td);
      return td;
    };
    const waiting = t.label === "unsure"; // only while the AI is still checking it
    if (waiting) tr.className = "ss-checking";
    cell(shortDate(t.date));
    cell(displayName(t)).title = t.description; // full bank text on hover
    cell(money(-t.amount), "ss-amount num");

    const labelCell = cell("");
    const pill = document.createElement("span");
    pill.className = waiting ? "pill checking" : "pill " + t.label;
    pill.textContent = waiting ? "Checking" : LABEL_TEXT[t.label];
    labelCell.append(pill);
    if (isBig(t)) {
      const chip = document.createElement("span");
      chip.className = "pill big";
      chip.textContent = "Big purchase";
      labelCell.append(" ", chip);
    }

    const why = cell(waiting ? "🤖 The AI is working out if this is a need or a want…" : whyText(t), "ss-why");
    const flag = flagged.get(t.date + t.description);
    if (flag && !waiting) {
      const note = document.createElement("span");
      note.className = "ss-flag";
      note.textContent = "⚠️ " + flag;
      why.append(note);
    }
    return tr;
  }));
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
if (statement?.classified.some((t) => t.label === "unsure")) askAiAboutUnsure(); // e.g. saved by an older version
