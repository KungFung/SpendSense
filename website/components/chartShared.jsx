import React from "react";

// Helpers and styles for SpendingChart. The look follows the Pact site (website/css/style.css):
// its purple, amber and lavender colours, white cards, system font for text and
// NatWest's RN House Sans in #383838 for numbers, and its night mode.

// Unusual-day markers use shape for severity, in ink so they don't clash with the bar colours.
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
  if (shape === "dot") return <circle cx={x} cy={y} r={size * 0.6} style={{ fill: "var(--mark)" }} />;
  const d = `M${x},${y - size} L${x + size},${y + size * 0.8} L${x - size},${y + size * 0.8} Z`;
  return shape === "filled" ? (
    <path d={d} style={{ fill: "var(--mark)" }} />
  ) : (
    <path d={d} style={{ fill: "var(--surface)", stroke: "var(--mark)", strokeWidth: 1.5 }} />
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

// Pact's colour tokens (website/css/style.css), by role. Night values apply under the Pact site's
// night mode (body.night). Bar colours were checked for colour blindness with the dataviz validator.
const LIGHT = `
  --surface: #ffffff; --surface-2: #f6f2fa; --ink: #1d1d1f; --ink-2: #6b6b76; --line: #e7e1ee; --num: #383838;
  --accent: #42145f; --accent-2: #5a287d; --accent-ink: #ffffff; --accent-soft: #ece4f3;
  --seg-other: #b3a8c0; --seg-pre: #5a287d; --seg-flag: #b25e00; --band: #ece4f3; --wkend: #faf7fc;
  --seg-need: #1a7f4b; --seg-want: #e0a046; --seg-big: #42145f; --need-bg: #e8f5ee; --want-bg: #fff4e5; --big-bg: #ece4f3;
  --mark: #1d1d1f; --flag-bg: #fff4e5; --pre-bg: #ece4f3; --alert: #b3261e;
  --shadow: 0 1px 3px rgba(42, 12, 63, 0.06); --tip-shadow: 0 10px 30px rgba(42, 12, 63, 0.18);
  color-scheme: light;`;
const NIGHT = `
  --surface: #21152f; --surface-2: #2e2040; --ink: #eeeeee; --ink-2: #a99bb8; --line: #3d2c52; --num: #eeeeee;
  --accent: #d9c2ef; --accent-2: #d9c2ef; --accent-ink: #21152f; --accent-soft: #2e2040;
  --seg-other: #6a5e78; --seg-pre: #b48ae0; --seg-flag: #d9873a; --band: #33244a; --wkend: #261a36;
  --seg-need: #4cb782; --seg-want: #e5a95a; --seg-big: #c9a3ee; --need-bg: #173426; --want-bg: #3a2712; --big-bg: #33244a;
  --mark: #eeeeee; --flag-bg: #3a2712; --pre-bg: #33244a; --alert: #f2a09a;
  --shadow: none; --tip-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  color-scheme: dark;`;

// Styles for the chart, scoped under .spend-chart (the chart's card).
export const CHART_CSS = `
.spend-chart {${LIGHT}
  --body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --numfont: "RN House Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
body.night .spend-chart {${NIGHT}
}

.spend-chart {
  box-sizing: border-box;
  min-width: 0; /* lets the chart scroll sideways instead of stretching a grid/flex parent */
  display: flex; flex-direction: column; gap: 16px;
  background: var(--surface); color: var(--ink);
  border-radius: 16px; padding: 20px; box-shadow: var(--shadow);
  font-family: var(--body); font-size: 15px; line-height: 1.45;
}
.spend-chart *, .spend-chart *::before, .spend-chart *::after { box-sizing: border-box; }
.spend-chart h2, .spend-chart p { margin: 0; }
.spend-chart button, .spend-chart input { font: inherit; color: inherit; }
.spend-chart :focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }

/* header */
.spend-chart .sc-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.spend-chart .sc-title { font-size: 20px; font-weight: 700; }
.spend-chart .sc-hint { color: var(--ink-2); font-size: 14px; }
.spend-chart .sc-empty { padding: 24px 0; color: var(--ink-2); font-size: 14px; }
.spend-chart .sc-error { color: var(--alert); }

/* headline numbers, like the Pact home cards */
.spend-chart .sc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.spend-chart .sc-stat { display: flex; flex-direction: column-reverse; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
.spend-chart .sc-stat span { font-size: 13px; font-weight: 700; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.6px; }
.spend-chart .sc-stat b { font-family: var(--numfont); font-size: 28px; font-weight: 400; line-height: 1.1; color: var(--num); font-variant-numeric: tabular-nums; }

/* controls */
.spend-chart .sc-controls { display: flex; justify-content: space-between; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.spend-chart .sc-scale { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--surface-2); }
.spend-chart .sc-scale button {
  border: 0; background: transparent; color: var(--ink-2); border-radius: 999px; padding: 7px 16px;
  font-size: 14px; font-weight: 600; cursor: pointer;
}
.spend-chart .sc-scale button.on { background: var(--accent); color: var(--accent-ink); }
.spend-chart .sc-range { display: flex; flex-wrap: wrap; align-self: flex-start; }
.spend-chart .sc-per { display: flex; align-items: center; gap: 10px; }
.spend-chart .sc-per > span { font-size: 13px; font-weight: 700; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.6px; }
.spend-chart .sc-scale-small { padding: 3px; }
.spend-chart .sc-scale-small button { padding: 4px 12px; font-size: 13px; }
.spend-chart .sc-toggle:has(input:disabled) { opacity: 0.5; cursor: default; }
.spend-chart .sc-time { font-family: var(--numfont); color: var(--ink-2); margin-right: 8px; }
.spend-chart .sc-toggles { display: flex; gap: 6px 18px; flex-wrap: wrap; }
.spend-chart .sc-toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink); cursor: pointer; }
.spend-chart .sc-toggle input { accent-color: var(--accent-2); margin: 0; width: 16px; height: 16px; }

/* chart */
.spend-chart .sc-area { position: relative; }
.spend-chart .sc-scroll { overflow-x: auto; }
.spend-chart .sc-plot { position: relative; }
.spend-chart svg { display: block; }
.spend-chart svg text { font-family: var(--numfont); font-size: 11.5px; fill: var(--ink-2); }
.spend-chart svg text.strong { fill: var(--ink); font-family: var(--body); font-weight: 600; font-size: 11px; }
.spend-chart .sc-gridline { stroke: var(--line); stroke-width: 1; }
.spend-chart .sc-wkend { fill: var(--wkend); }
.spend-chart .sc-band { fill: var(--band); }
.spend-chart .sc-sel { fill: none; stroke: var(--accent-2); stroke-width: 2; pointer-events: none; }
.spend-chart .sc-avg { fill: none; stroke: var(--ink); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; pointer-events: none; }
.spend-chart .sc-avg-halo { fill: none; stroke: var(--surface); stroke-width: 5; stroke-linejoin: round; pointer-events: none; }
.spend-chart .sc-dot { fill: var(--ink); stroke: var(--surface); stroke-width: 2; pointer-events: none; }
.spend-chart svg text.sc-end-label { fill: var(--ink); font-family: var(--body); font-weight: 600; font-size: 12px; }
.spend-chart svg text.sc-empty-label { fill: var(--ink-2); font-family: var(--body); font-size: 14px; }
.spend-chart svg text.sc-mark-count { fill: var(--mark); font-family: var(--body); font-weight: 700; font-size: 10.5px; }

/* legend */
.spend-chart .sc-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--ink-2); margin: 0; padding: 0; list-style: none; }
.spend-chart .sc-legend li { display: flex; align-items: center; }
.spend-chart .sc-key { display: inline-block; width: 12px; height: 12px; border-radius: 4px; margin-right: 7px; flex: none; }
.spend-chart .sc-key-line { width: 14px; height: 2px; border-radius: 1px; background: var(--ink); }
.spend-chart .sc-legend svg { margin-right: 7px; flex: none; }

/* tooltip, like the Pact toast */
.spend-chart .sc-tip {
  position: absolute; z-index: 1; pointer-events: none;
  background: var(--surface); border-radius: 14px; box-shadow: var(--tip-shadow);
  border: 1px solid var(--line); padding: 14px 16px; font-size: 13.5px;
  display: flex; flex-direction: column; gap: 8px;
  overflow-wrap: anywhere;
}
.spend-chart .sc-tip-date { font-size: 13px; font-weight: 700; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.6px; }
.spend-chart .sc-tip-total { font-family: var(--numfont); font-size: 28px; line-height: 1.1; color: var(--num); }
.spend-chart .sc-tip-section { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--line); padding-top: 8px; }
.spend-chart .sc-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.spend-chart .sc-row > span:first-child { display: flex; align-items: center; flex: 1; color: var(--ink-2); min-width: 0; }
.spend-chart .sc-row > span:last-child { font-family: var(--numfont); color: var(--num); white-space: nowrap; }
.spend-chart .sc-note { color: var(--ink-2); font-size: 12.5px; }
.spend-chart .sc-chip { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-right: 6px; white-space: nowrap; }
.spend-chart .sc-chip.flag, .spend-chart .sc-chip.flagged { background: var(--flag-bg); color: var(--seg-flag); }
.spend-chart .sc-chip.pre, .spend-chart .sc-chip.preApproved { background: var(--pre-bg); color: var(--seg-pre); }
.spend-chart .sc-chip.big { background: var(--big-bg); color: var(--seg-big); }
.spend-chart .sc-pill { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; margin-bottom: 2px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; background: var(--surface-2); color: var(--ink); }

/* footer, buttons and table */
.spend-chart .sc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.spend-chart .sc-foot-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.spend-chart .sc-source { font-size: 13px; color: var(--ink-2); overflow-wrap: anywhere; }
.spend-chart .sc-source b { color: var(--ink); font-weight: 600; }
.spend-chart .sc-linkbtn { border: 0; background: none; padding: 0; color: var(--accent-2); font-size: 13px; font-weight: 600; text-decoration: underline; cursor: pointer; }
.spend-chart .sc-upload-error { font-size: 13px; color: var(--alert); }
.spend-chart .sc-btn {
  border: 1.5px solid var(--accent); background: transparent; color: var(--accent);
  border-radius: 999px; padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.spend-chart .sc-btn.solid { background: var(--accent); color: var(--accent-ink); }
.spend-chart .sc-btn:disabled { opacity: 0.5; cursor: default; }
.spend-chart .sc-table-wrap { max-height: 340px; overflow: auto; }
.spend-chart .sc-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.spend-chart .sc-table th { text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--ink-2); font-weight: 700; position: sticky; top: 0; background: var(--surface); border-bottom: 1px solid var(--line); }
.spend-chart .sc-table td { padding: 8px; border-top: 1px solid var(--line); }
.spend-chart .sc-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.spend-chart .sc-table td.num { font-family: var(--numfont); color: var(--num); }
.spend-chart .sc-table td.sc-muted { color: var(--ink-2); }
`;
