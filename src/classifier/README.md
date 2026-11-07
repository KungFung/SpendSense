# Need vs Want classifier + impulse flags

Reads a bank statement, labels every transaction as a **need**, **want**, **unsure** or **income**,
then gently points out spending that *might* be impulsive. It's a supportive coach, not a blocker:
it never stops a payment, it just shows the person a pattern and the numbers behind it.

## Run it

```bash
npm install            # once, installs the Gemini SDK
npm run classify       # classify sample-data/sample_statement.csv and print a summary
npm run classify -- statement.csv   # any other CSV (the team's statement.csv works too)
npm run classify -- --no-ai         # rules only, never calls Gemini
npm test               # 21 tests, using Node's built-in test runner
```

Needs Node 22 or newer.

**Optional AI:** copy `.env.example` to `.env` and paste a key from https://aistudio.google.com/apikey.
Without a key everything still works; the tricky transactions just stay "unsure".

## How it decides (the 30-second pitch)

The code works through these steps in order, cheapest and most predictable first:

| Step | What | Example | confidence | source |
|---|---|---|---|---|
| 0 | Money in → **income** | `ACME LTD SALARY +2150` | 1.0 | `category` |
| 1 | **Keyword rules** (`website/js/classifier/keywords.js`) | `TESCO STORES 3297` → need (groceries) | 0.9 | `keyword` |
| 2 | **Category rules**, if the parser gave a category | category `Groceries` → need | 0.75 | `category` |
| 3 | Mixed shops / no match → **unsure** | `AMAZON`, `PAYPAL *XYZ123`, `UBER TRIP` | 0–0.3 | `keyword` |
| 4 | **Gemini**, for the unsure ones only (optional) | `AMAZON` → want, "probably a gadget" | from AI | `ai` |

Why this order? Rules are free, instant, private and easy to explain. The AI only gets the leftovers.

**Privacy:** only the *unsure* transactions go to Gemini, in **one** request, and only their
description and amount. No dates, balances or names, never the whole statement. Long numbers
(card digits, references) are masked as `####`.

**Safety:** if there's no key, no internet, a bad key or a weird reply, the code catches it and
carries on. The app never crashes because of the AI. The AI never produces numbers: every £ figure
in the impulse flags is calculated in our code.

## Input format

An array of transactions (this is what `csvLoader.js` produces; the real CSV parser should produce the same):

```js
{ date: "2026-09-01", description: "TESCO STORES 3297", amount: -45.00,
  type: "expense", category: null, merchant: null }
```

- `amount`: negative = money out, positive = money in
- `type`: `"expense"` or `"income"`
- `category`, `merchant`: `null` if unknown. Never invent them.

## Output format

The same objects, unchanged, with these fields added:

```js
{ ...original,
  label: "want",                 // "need" | "want" | "unsure" | "income"
  confidence: 0.9,               // 0 to 1
  reason: 'Matched "DELIVEROO" (fast food/takeaway), usually a want',
  source: "keyword",             // "keyword" | "category" | "ai"
  group: "fast food/takeaway" }  // shop type, or null if unknown
```

`detectImpulseSpending(classified)` returns a list of flags:

```js
{ type: "busy_day",             // "big_want" | "busy_day" | "payday_burst"
  date: "2026-09-12",
  message: "You had 4 takeaway, fashion, gaming purchases on 12 Sep (£86), about 4x your usual daily want spending (£20.45). ...",
  numbers: { count: 4, total: 86, usualDailyWantSpending: 20.45, timesUsual: 4.21 },
  transactions: [ { date, description, amount }, ... ] }
```

| Flag | Triggers when | "Usual" means |
|---|---|---|
| `big_want` | one want is 3x+ your usual want **and** at least £30 | median want purchase (needs 5+ wants) |
| `busy_day` | 4+ wants on one day | median daily want total |
| `payday_burst` | £100+ of wants in payday + 3 days, **and** 2x+ usual | your average want spending over 4 days |

Subscriptions and the gym are left out of the impulse checks: they're regular, not impulsive.
Thresholds live in `SETTINGS` at the top of `website/js/classifier/impulse.js`. Live purchases on the website
are nudged a little earlier, at 2.5x usual (`NUDGE_MULTIPLE` in `website/js/statement.js`).

## Use it from other code

```js
const { loadStatementCsv, classifyTransactions, detectImpulseSpending } = require("./src/classifier");

const transactions = loadStatementCsv("statement.csv");     // or the real parser's output
const classified = await classifyTransactions(transactions); // { useAI: false } to skip Gemini
const flags = detectImpulseSpending(classified);
```

**For the website:** `website/` is plain `<script>` files opened straight from disk, and this repo is
public, so the Gemini key must **never** go into browser code. The plan is: the server (`server/`)
calls these functions and sends `classified` + `flags` to the page as JSON. `classifyByRules` and
`detectImpulseSpending` don't use any Node features, so they could also be copied into the browser
later if we want an offline, rules-only version.

## Add or fix a keyword

Open `website/js/classifier/keywords.js` and add the shop name to the right list:

```js
{ label: "want", group: "fast food/takeaway", keywords: ["MCDONALDS", "KFC", ..., "WINGSTOP"] },
```

- Case and punctuation don't matter (`McDonald's` = `MCDONALDS`).
- A keyword matches the **start of a word**, so `TESCO` matches `TESCO STORES 3297`, `SAINSBURY` matches `SAINSBURYS`, but `EE` does not match `COFFEE`.
- If two keywords match, the longer one wins (`UBER EATS` beats `UBER`).
- Shops that sell both (Amazon, Boots, Argos...) go in the `"unsure"` group.
- Add a test in `classifier.test.js` and run `npm test`.

## Files

The rules are shared with the website, so they live in `website/js/classifier/` (the dev server only serves
files inside `website/`). The Node-only parts stay here.

| File | Job |
|---|---|
| `src/classifier/index.js` | the one file to import in Node; adds the optional Gemini step |
| `src/classifier/gemini.js` | the batched, private, crash-proof Gemini call |
| `src/classifier/run.js` | `npm run classify` summary |
| `src/classifier/classifier.test.js` | tests |
| `website/js/classifier/keywords.js` | keyword + category lists: **edit me** |
| `website/js/classifier/classifier.js` | keyword rules → category rules → unsure |
| `website/js/classifier/impulse.js` | the three impulse checks and their messages |
| `website/js/classifier/csvLoader.js` | reads a statement CSV (Node and browser) |
| `website/js/statement.js` | the website side: upload, Needs & wants page, `labelPurchase`, `compareToUsual` |
