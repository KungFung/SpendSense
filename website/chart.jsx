import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import SpendingChart from "./components/SpendingChart.jsx";
import { parseStatement } from "./components/csvData.js";
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

function PactSpendingChart() {
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState(pactPurchases);

  useEffect(() => {
    fetch(statementUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`${statementUrl}: ${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => setStatement(parseStatement(text)))
      .catch(setError);
  }, []);

  // Pact posts a message when a purchase goes through (or the demo is reset); the storage event
  // covers the chart open in its own tab.
  useEffect(() => {
    const refresh = () => setExtra(pactPurchases());
    const onMessage = (e) => {
      if (e.data?.type === "pact:purchases-changed") refresh();
      if (e.data?.type === "pact:night") document.body.classList.toggle("night", Boolean(e.data.on));
    };
    const onStorage = (e) => {
      if (e.key === PACT_SPENT_KEY || e.key === null) refresh();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const data = useMemo(
    () => statement && analyseStatement([...statement, ...extra].sort((a, b) => a.date.localeCompare(b.date))),
    [statement, extra]
  );

  if (error) return <SpendingChart statementUrl={statementUrl} />; // shows the chart's own error message
  if (!data) return null;
  return <SpendingChart data={data} />;
}

createRoot(document.getElementById("root")).render(<PactSpendingChart />);

if (embedded && window.parent !== window) {
  const root = document.getElementById("root");
  new ResizeObserver(() => {
    window.parent.postMessage({ type: "pact:chart-height", height: Math.ceil(root.getBoundingClientRect().height) }, "*");
  }).observe(root);
}
