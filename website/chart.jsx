import React from "react";
import { createRoot } from "react-dom/client";
import SpendingChart from "./components/SpendingChart.jsx";
// Vite serves this file in dev and copies it into the build, so the chart can fetch it.
import statementUrl from "../statement_withinfo.csv?url";

// chart.html?night shows the Pact site's night mode.
if (new URLSearchParams(location.search).has("night")) document.body.classList.add("night");

createRoot(document.getElementById("root")).render(<SpendingChart statementUrl={statementUrl} />);
