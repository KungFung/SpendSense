import React from "react";

// Helpers and styles for SpendingChart. The look follows Offbeat.html: same colour tokens,
// fonts (Bricolage Grotesque / IBM Plex Sans / IBM Plex Mono), card and chart styling,
// and the same light and dark themes.

// Unusual-day markers use shape for severity, in Offbeat's "above range" amber.
// Ordered from most to least serious.
export const SEVERITY = [
  { classification: "Significant overspending", label: "Significant overspending", shape: "filled" },
  { classification: "Potential overspending", label: "Potential overspending", shape: "hollow" },
  { classification: "Elevated", label: "Elevated spending", shape: "dot" },
];
export const severityRank = (c) => {
  const i = SEVERITY.findIndex((s) => s.classification === c);
  return i === -1 ? SEVERITY.length - 1 : i;
};

export function AnomalyMarker({ x, y, shape, size = 5 }) {
  if (shape === "dot") return <circle cx={x} cy={y} r={size * 0.6} style={{ fill: "var(--warn)" }} />;
  const d = `M${x},${y - size} L${x + size},${y + size * 0.8} L${x - size},${y + size * 0.8} Z`;
  return shape === "filled" ? (
    <path d={d} style={{ fill: "var(--warn)" }} />
  ) : (
    <path d={d} style={{ fill: "var(--surface)", stroke: "var(--warn)", strokeWidth: 1.5 }} />
  );
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAY_MS = 24 * 60 * 60 * 1000;

export const pounds = (n) =>
  "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const poundsShort = (n) => "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

// Round the axis maximum up to a tidy number and return evenly spaced ticks.
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v < max + step; v += step) ticks.push(v);
  return ticks;
}

// Bar with rounded top corners and a flat bottom on the baseline.
export function barPath(x, y, w, h, r = 2) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// Shown in place of the chart while its CSV is loading, or if loading failed.
export function ChartMessage({ title, error, children }) {
  return (
    <section className="spend-chart">
      <style>{CHART_CSS}</style>
      <h2 className="sc-title">{title}</h2>
      <p className={error ? "sc-empty sc-error" : "sc-empty"}>
        {error ? `Couldn't load the data (${error.message}).` : "Loading…"}
      </p>
      {children}
    </section>
  );
}

// Offbeat's colour tokens. Dark values apply with the OS dark setting unless the page sets
// data-theme="light", or always when the page sets data-theme="dark" (as Offbeat does).
const LIGHT = `
  --bg: #EBEFF2; --surface: #FFFFFF; --surface-2: #F2F5F7; --ink: #101C26; --ink-2: #506270; --line: #D5DDE3;
  --accent: #0E6A8A; --accent-ink: #FFFFFF; --band: #CFE4EC; --bar: #8798A5;
  --ok: #2A7B4E; --ok-bg: #DDF0E5; --warn: #9A5600; --warn-bg: #FBEBCF; --alert: #B0261E; --alert-bg: #F9DDDA;
  color-scheme: light;`;
const DARK = `
  --bg: #0D151C; --surface: #15212B; --surface-2: #1B2A36; --ink: #E6EDF2; --ink-2: #98A8B4; --line: #263643;
  --accent: #5DB8D6; --accent-ink: #06222D; --band: #21404F; --bar: #6C8292;
  --ok: #5EC08C; --ok-bg: #163526; --warn: #E5A446; --warn-bg: #3A2B12; --alert: #F28C84; --alert-bg: #3F1B19;
  color-scheme: dark;`;

// Styles for the chart, scoped under .spend-chart (the chart's card).
export const CHART_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap");

.spend-chart {${LIGHT}
  --display: 'Bricolage Grotesque', 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
  --body: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .spend-chart {${DARK}
  }
}
:root[data-theme="dark"] .spend-chart {${DARK}
}

.spend-chart {
  box-sizing: border-box;
  min-width: 0; /* lets the chart scroll sideways instead of stretching a grid/flex parent */
  display: flex; flex-direction: column; gap: 14px;
  background: var(--surface); color: var(--ink);
  border: 1px solid var(--line); border-radius: 10px; padding: 18px;
  font-family: var(--body); font-size: 15px; line-height: 1.5;
}
.spend-chart *, .spend-chart *::before, .spend-chart *::after { box-sizing: border-box; }
.spend-chart h2, .spend-chart p { margin: 0; }
.spend-chart button, .spend-chart input { font: inherit; color: inherit; }
.spend-chart :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* header */
.spend-chart .sc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.spend-chart .sc-title { font-family: var(--display); font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.spend-chart .sc-hint { color: var(--ink-2); font-size: 12.5px; }
.spend-chart .sc-empty { padding: 24px 0; color: var(--ink-2); }
.spend-chart .sc-error { color: var(--alert); }

/* headline numbers, like Offbeat's meters */
.spend-chart .sc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px 24px; }
.spend-chart .sc-stat { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.spend-chart .sc-stat span { font-size: 12.5px; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.06em; }
.spend-chart .sc-stat b { font-family: var(--mono); font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums; }

/* controls */
.spend-chart .sc-controls { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.spend-chart .sc-scale { display: flex; flex-wrap: wrap; gap: 6px; }
.spend-chart .sc-scale button {
  border: 1px solid var(--line); background: var(--surface); border-radius: 999px; padding: 4px 14px;
  font-size: 13.5px; cursor: pointer;
}
.spend-chart .sc-scale button.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
.spend-chart .sc-toggles { display: flex; gap: 6px 16px; flex-wrap: wrap; }
.spend-chart .sc-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
.spend-chart .sc-toggle input { accent-color: var(--accent); margin: 0; }

/* chart */
.spend-chart .sc-area { position: relative; }
.spend-chart .sc-scroll { overflow-x: auto; }
.spend-chart .sc-plot { position: relative; }
.spend-chart svg { display: block; }
.spend-chart svg text { font-family: var(--mono); font-size: 10.5px; fill: var(--ink-2); }
.spend-chart svg text.strong { fill: var(--ink); font-weight: 500; }
.spend-chart .sc-gridline { stroke: var(--line); stroke-width: 1; }
.spend-chart .sc-wkend { fill: var(--surface-2); }
.spend-chart .sc-band { fill: var(--band); }
.spend-chart .sc-sel { fill: none; stroke: var(--accent); stroke-width: 2; pointer-events: none; }
.spend-chart .sc-avg { fill: none; stroke: var(--ink); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; pointer-events: none; }
.spend-chart .sc-avg-halo { fill: none; stroke: var(--surface); stroke-width: 5; stroke-linejoin: round; pointer-events: none; }
.spend-chart .sc-dot { fill: var(--ink); stroke: var(--surface); stroke-width: 2; pointer-events: none; }
.spend-chart svg text.sc-end-label { fill: var(--ink); font-weight: 500; }
.spend-chart svg text.sc-mark-count { fill: var(--warn); font-weight: 500; }

/* legend */
.spend-chart .sc-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink-2); margin: 0; padding: 0; list-style: none; }
.spend-chart .sc-legend li { display: flex; align-items: center; }
.spend-chart .sc-key { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; flex: none; }
.spend-chart .sc-key-line { width: 14px; height: 2px; border-radius: 1px; background: var(--ink); }
.spend-chart .sc-legend svg { margin-right: 6px; flex: none; }

/* tooltip */
.spend-chart .sc-tip {
  position: absolute; z-index: 1; pointer-events: none;
  background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 8px 24px rgba(16, 28, 38, 0.14); padding: 12px 14px; font-size: 13px;
  display: flex; flex-direction: column; gap: 8px;
}
.spend-chart .sc-tip-date { font-family: var(--mono); font-size: 12.5px; font-weight: 500; }
.spend-chart .sc-tip-total { font-family: var(--display); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.spend-chart .sc-tip-section { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.spend-chart .sc-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.spend-chart .sc-row > span:first-child { display: flex; align-items: center; color: var(--ink-2); min-width: 0; }
.spend-chart .sc-row > span:last-child { font-family: var(--mono); font-size: 12.5px; white-space: nowrap; }
.spend-chart .sc-note { color: var(--ink-2); font-size: 12px; }
.spend-chart .sc-chip { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 4px; margin-right: 6px; white-space: nowrap; }
.spend-chart .sc-chip.alert { background: var(--alert-bg); color: var(--alert); }
.spend-chart .sc-chip.accent { background: var(--band); color: var(--accent); }
.spend-chart .sc-pill { margin-bottom: 2px; display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 12px; background: var(--warn-bg); color: var(--warn); }

/* footer and table */
.spend-chart .sc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.spend-chart .sc-foot-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.spend-chart .sc-source { font-size: 12.5px; color: var(--ink-2); overflow-wrap: anywhere; }
.spend-chart .sc-source b { font-family: var(--mono); font-weight: 500; color: var(--ink); }
.spend-chart .sc-linkbtn { border: 0; background: none; padding: 0; color: var(--accent); font-size: 12.5px; text-decoration: underline; cursor: pointer; }
.spend-chart .sc-btn.solid { background: var(--accent); color: var(--accent-ink); }
.spend-chart .sc-btn:disabled { opacity: 0.5; cursor: default; }
.spend-chart .sc-upload-error { font-size: 12.5px; color: var(--alert); }
.spend-chart .sc-btn { border: 1px solid var(--accent); background: transparent; color: var(--accent); border-radius: 8px; padding: 5px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
.spend-chart .sc-table-wrap { max-height: 320px; overflow: auto; }
.spend-chart .sc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.spend-chart .sc-table th { text-align: left; padding: 6px 8px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--ink-2); font-weight: 600; position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--line); }
.spend-chart .sc-table td { padding: 7px 8px; border-top: 1px solid var(--line); }
.spend-chart .sc-table .num { text-align: right; font-family: var(--mono); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.spend-chart .sc-table td.sc-muted { color: var(--ink-2); }
.spend-chart .sc-table th.num { font-family: var(--body); font-size: 11.5px; }
`;
