import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import SpendingChart from "./components/SpendingChart.jsx";
import { cleanDescription, parseStatement } from "./components/csvData.js";
import { analyseStatement } from "./components/analysis.js";
// Vite serves this file in dev and copies it into the build, so the chart can fetch it.
import statementUrl from "../statement_withinfo.csv?url";

const params = new URLSearchParams(location.search);
// chart.html?night shows the Pact site's night mode.
if (params.has("night")) document.body.classList.add("night");
// chart.html?embed is the version inside Pact's dashboard: no page padding, and it tells
// the dashboard how tall it is so the frame fits without scrolling.
const embedded = params.has("embed");
if (embedded) document.body.classList.add("embed");

// Purchases that went through in Pact's demo (Demo controls page, shop window) are saved by
// Pact (website/js/app.js, recordSpend) under this key, in the same shape as parseStatement's
// transactions. They're added on top of the statement, so a demo purchase shows up as the latest bar.
const PACT_SPENT_KEY = "pact.spent";
function pactPurchases() {
  try {
    return JSON.parse(localStorage.getItem(PACT_SPENT_KEY)) ?? [];
  } catch {
    return [];
  }
}

// The statement the user uploaded on Pact's "Needs & wants" page (website/js/statement.js saves it
// under this key), already labelled need / want by our rules and the AI. When there is one, the chart
// draws THAT, coloured Needs / Wants / Big purchases. Without one it falls back to the sample file.
const PACT_STATEMENT_KEY = "pact.statement";
function pactStatement() {
  try {
    const saved = JSON.parse(localStorage.getItem(PACT_STATEMENT_KEY));
    if (!saved?.classified?.length) return null;
    // Big purchases = wants the impulse check found much bigger than usual (same as the Pact page).
    const key = (t) => `${t.date}|${t.description}|${t.amount}`;
    const big = new Set((saved.flags || []).filter((f) => f.type === "big_want").flatMap((f) => f.transactions.map(key)));
    return {
      fileName: saved.fileName,
      transactions: saved.classified.map((t) => ({
        date: `${t.date}T${t.time || "12:00"}`,
        type: t.bankType || (t.amount > 0 ? "BAC" : "POS"),
        description: cleanDescription(t.description || "", t.bankType || undefined),
        value: t.amount,
        balance: null,
        flagged: false,
        preApproved: false,
        segment: t.amount >= 0 ? undefined : big.has(key(t)) ? "big" : t.label === "need" ? "need" : "want",
      })),
    };
  } catch {
    return null;
  }
}

function PactSpendingChart() {
  const [statement, setStatement] = useState(null);
  const [uploaded, setUploaded] = useState(pactStatement);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState(pactPurchases);

  useEffect(() => {
    if (uploaded) return; // the user's own statement: no need for the sample file
    fetch(statementUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`${statementUrl}: ${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => setStatement(parseStatement(text)))
      .catch(setError);
  }, [uploaded]);

  // Pact posts a message when a purchase goes through (or the demo is reset); the storage event
  // covers the chart open in its own tab.
  useEffect(() => {
    const refresh = () => setExtra(pactPurchases());
    const refreshStatement = () => setUploaded(pactStatement());
    const onMessage = (e) => {
      if (e.data?.type === "pact:purchases-changed") refresh();
      if (e.data?.type === "pact:statement-changed") refreshStatement();
      if (e.data?.type === "pact:night") document.body.classList.toggle("night", Boolean(e.data.on));
    };
    const onStorage = (e) => {
      if (e.key === PACT_SPENT_KEY || e.key === null) refresh();
      if (e.key === PACT_STATEMENT_KEY || e.key === null) refreshStatement();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const base = uploaded?.transactions ?? statement;
  const data = useMemo(
    () => base && analyseStatement([...base, ...extra].sort((a, b) => a.date.localeCompare(b.date))),
    [base, extra]
  );

  if (!uploaded && error) return <SpendingChart statementUrl={statementUrl} />; // shows the chart's own error message
  if (!data) return null;
  // With the user's statement, uploading happens on the Pact page, so the chart hides its own button.
  return <SpendingChart key={uploaded ? uploaded.fileName + base.length : "sample"} data={data} sourceName={uploaded?.fileName} hideUpload={Boolean(uploaded)} />;
}

createRoot(document.getElementById("root")).render(<PactSpendingChart />);

if (embedded && window.parent !== window) {
  const root = document.getElementById("root");
  new ResizeObserver(() => {
    window.parent.postMessage({ type: "pact:chart-height", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
  }).observe(root);
}
