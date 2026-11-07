// classifier.test.js — run with:  npm test
// Uses Node's built-in test runner (no extra packages needed).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { classifyTransactions, classifyByRules, detectImpulseSpending, loadStatementCsv, parseStatementCsv } = require("./index");
const { maskDigits } = require("./gemini");

// Helper: make a transaction in the shared format.
const tx = (date, description, amount, category = null) => ({
  date,
  description,
  amount,
  type: amount > 0 ? "income" : "expense",
  category,
  merchant: null,
});

// ---------- CSV loader ----------

test("loader turns CSV rows into the shared format, with null for unknowns", () => {
  const rows = parseStatementCsv("Date,Description,Amount\n2026-09-01,Tesco,-45.00\n2026-09-02,ACME SALARY,2000");
  assert.deepEqual(rows[0], { date: "2026-09-01", description: "Tesco", amount: -45, type: "expense", category: null, merchant: null });
  assert.equal(rows[1].type, "income");
});

test("loader copes with the team's real statement format (quoted commas, '05 Nov 2026' dates, Value column)", () => {
  const csv = 'Date,Type,Description,Value,Balance\n03 Nov 2026 13:11,POS,"\'3167 03Nov26 C , DELIVEROO , GB",-33.08,1596.42';
  const [row] = parseStatementCsv(csv);
  assert.equal(row.date, "2026-11-03");
  assert.equal(row.description, "3167 03Nov26 C , DELIVEROO , GB");
  assert.equal(row.amount, -33.08);
});

test("the sample statement loads with ~50 transactions", () => {
  const rows = loadStatementCsv(path.join(__dirname, "..", "..", "sample-data", "sample_statement.csv"));
  assert.ok(rows.length >= 40 && rows.length <= 55);
  assert.ok(rows.every((r) => r.date && r.description && Number.isFinite(r.amount)));
});

// ---------- Keyword and category rules ----------

test("messy bank text still matches keywords (case-insensitive)", () => {
  assert.equal(classifyByRules(tx("2026-09-01", "TESCO STORES 1234", -20)).label, "need");
  assert.equal(classifyByRules(tx("2026-09-01", "tesco express", -5)).label, "need");
  assert.equal(classifyByRules(tx("2026-09-01", "McDonald's 1182", -8)).label, "want");
  assert.equal(classifyByRules(tx("2026-09-01", "'4492 20Aug26 C , DELIVEROO , GB", -20)).label, "want");
  assert.equal(classifyByRules(tx("2026-09-01", "SAINSBURYS S/MKTS", -30)).label, "need");
});

test("results have label, confidence, reason and source", () => {
  const result = classifyByRules(tx("2026-09-01", "NETFLIX.COM", -10.99));
  assert.equal(result.label, "want");
  assert.equal(result.source, "keyword");
  assert.ok(result.confidence > 0 && result.confidence <= 1);
  assert.match(result.reason, /NETFLIX/);
});

test("short keywords don't match inside other words ('EE' is not in 'COFFEE')", () => {
  assert.equal(classifyByRules(tx("2026-09-01", "COSTA COFFEE 43021", -3)).group, "coffee/eating out");
});

test("the longer keyword wins: UBER EATS is a want, plain UBER is unsure", () => {
  assert.equal(classifyByRules(tx("2026-09-01", "UBER *EATS", -20)).label, "want");
  assert.equal(classifyByRules(tx("2026-09-01", "UBER TRIP", -12)).label, "unsure");
});

test("money in is income", () => {
  assert.equal(classifyByRules(tx("2026-09-01", "ACME LTD SALARY", 2150)).label, "income");
});

test("category rules are used when no keyword matches", () => {
  const result = classifyByRules(tx("2026-09-01", "SOME LOCAL SHOP", -15, "Groceries"));
  assert.equal(result.label, "need");
  assert.equal(result.source, "category");
});

test("mixed shops and unknown text are unsure", () => {
  assert.equal(classifyByRules(tx("2026-09-01", "AMAZON.CO.UK*2K4P1", -24)).label, "unsure");
  assert.equal(classifyByRules(tx("2026-09-01", "PAYPAL *XYZ123", -15)).label, "unsure");
  const unknown = classifyByRules(tx("2026-09-01", "ZZZ MYSTERY LTD", -9));
  assert.equal(unknown.label, "unsure");
  assert.equal(unknown.confidence, 0);
});

test("the input array is not changed", () => {
  const input = [tx("2026-09-01", "TESCO", -20)];
  classifyByRules(input[0]);
  assert.equal(input[0].label, undefined);
});

// ---------- Gemini step (using a fake client, so no internet or key is needed) ----------

const fakeClient = (replyText, seen = {}) => ({
  models: {
    generateContent: async (request) => {
      seen.request = request;
      return { text: replyText };
    },
  },
});

test("without an API key, unsure stays unsure and nothing crashes", async () => {
  const [result] = await classifyTransactions([tx("2026-09-01", "AMAZON", -20)], { apiKey: "" });
  assert.equal(result.label, "unsure");
});

test("AI answers are applied, and ONLY unsure description + amount are sent", async () => {
  const seen = {};
  const reply = JSON.stringify([{ id: 0, label: "need", confidence: 0.7, reason: "Likely household items" }]);
  const results = await classifyTransactions(
    [tx("2026-09-01", "TESCO", -20), tx("2026-09-02", "AMAZON 12345678", -30)],
    { client: fakeClient(reply, seen) }
  );

  assert.equal(results[0].source, "keyword"); // Tesco never went to the AI
  assert.equal(results[1].label, "need");
  assert.equal(results[1].source, "ai");

  const sentText = seen.request.contents;
  assert.ok(!sentText.includes("TESCO"), "known transactions must not be sent");
  assert.ok(!sentText.includes("2026-09-02"), "dates must not be sent");
  assert.ok(!sentText.includes("12345678"), "long numbers must be masked");
});

test("a broken AI reply is ignored, not crashed on", async () => {
  const results = await classifyTransactions([tx("2026-09-01", "AMAZON", -20)], { client: fakeClient("not json at all") });
  assert.equal(results[0].label, "unsure");

  const weird = JSON.stringify([{ id: 0, label: "luxury", confidence: 5, reason: "?" }, { id: 99, label: "want" }]);
  const results2 = await classifyTransactions([tx("2026-09-01", "AMAZON", -20)], { client: fakeClient(weird) });
  assert.equal(results2[0].label, "unsure");
});

test("an AI error (e.g. no internet) is caught", async () => {
  const exploding = { models: { generateContent: async () => { throw new Error("network down"); } } };
  const results = await classifyTransactions([tx("2026-09-01", "AMAZON", -20)], { client: exploding });
  assert.equal(results[0].label, "unsure");
});

test("maskDigits hides card and reference numbers", () => {
  assert.equal(maskDigits("7658 20Aug26 C , ASOS.COM"), "#### 20Aug26 C , ASOS.COM");
});

// ---------- Impulse flags ----------

// A normal month of small wants, so the code can learn what "usual" looks like.
function normalMonth() {
  return [
    tx("2026-09-01", "ACME SALARY", 2000),
    tx("2026-09-02", "TESCO", -40),
    tx("2026-09-05", "COSTA", -4),
    tx("2026-09-08", "MCDONALDS", -8),
    tx("2026-09-11", "DELIVEROO", -20),
    tx("2026-09-15", "NANDOS", -18),
    tx("2026-09-20", "GREGGS", -5),
    tx("2026-09-25", "STARBUCKS", -6),
  ];
}

test("a want much bigger than usual is flagged with the real numbers", async () => {
  const classified = await classifyTransactions([...normalMonth(), tx("2026-09-27", "ASOS.COM", -120)], { useAI: false });
  const flag = detectImpulseSpending(classified).find((f) => f.type === "big_want");
  assert.ok(flag);
  assert.equal(flag.numbers.amount, 120);
  assert.equal(flag.numbers.usualWantPurchase, 8); // median of 4,5,6,8,18,20,120
  assert.match(flag.message, /£120/);
});

test("4+ wants on one day is flagged", async () => {
  const busy = ["MCDONALDS", "DELIVEROO", "ASOS", "STEAM"].map((d) => tx("2026-09-12", d, -10));
  const classified = await classifyTransactions([...normalMonth(), ...busy], { useAI: false });
  const flag = detectImpulseSpending(classified).find((f) => f.type === "busy_day");
  assert.ok(flag);
  assert.equal(flag.numbers.count, 4);
  assert.equal(flag.numbers.total, 40);
  assert.match(flag.message, /4 .* purchases on 12 Sep \(£40\)/);
});

test("a burst of wants right after payday is flagged", async () => {
  const burst = [tx("2026-09-01", "ASOS", -90), tx("2026-09-02", "STEAM", -60), tx("2026-09-03", "DELIVEROO", -25)];
  const classified = await classifyTransactions([...normalMonth(), ...burst], { useAI: false });
  const flag = detectImpulseSpending(classified).find((f) => f.type === "payday_burst");
  assert.ok(flag);
  assert.equal(flag.numbers.total, 175);
  assert.equal(flag.transactions.length, 3);
});

test("ordinary spending gives no flags, and subscriptions never count as impulsive", async () => {
  const subs = [tx("2026-09-04", "NETFLIX", -11), tx("2026-09-04", "SPOTIFY", -12), tx("2026-09-04", "PUREGYM", -25), tx("2026-09-04", "COSTA", -3)];
  const classified = await classifyTransactions([...normalMonth(), ...subs], { useAI: false });
  assert.deepEqual(detectImpulseSpending(classified), []);
});

test("an empty statement gives no flags and no crash", () => {
  assert.deepEqual(detectImpulseSpending([]), []);
});
