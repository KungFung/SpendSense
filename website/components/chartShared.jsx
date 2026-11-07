import React from "react";

// Helpers shared by SpendingChart and SpendingTrendChart.

// Anomaly markers use shape (not colour) so they don't clash with the bar colours.
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

export const MARK_COLOR = "#42145f"; // Pact purple
const SURFACE = "#fcfcfb";

export function AnomalyMarker({ x, y, shape, size = 5 }) {
  if (shape === "dot") return <circle cx={x} cy={y} r={size * 0.6} fill={MARK_COLOR} />;
  const d = `M${x},${y - size} L${x + size},${y + size * 0.8} L${x - size},${y + size * 0.8} Z`;
  return shape === "filled" ? (
    <path d={d} fill={MARK_COLOR} />
  ) : (
    <path d={d} fill={SURFACE} stroke={MARK_COLOR} strokeWidth={1.5} />
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
export function barPath(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// Shown in place of a chart while its CSV is loading, or if loading failed.
export function ChartMessage({ title, error }) {
  return (
    <div className="spend-chart">
      <style>{CHART_CSS}</style>
      <h2 className="sc-title">{title}</h2>
      <p className={error ? "sc-sub sc-error" : "sc-sub"}>
        {error ? `Couldn't load the data (${error.message}).` : "Loading…"}
      </p>
    </div>
  );
}

// Styles for both charts, scoped under .spend-chart.
export const CHART_CSS = `
.spend-chart {
  box-sizing: border-box;
  min-width: 0; /* lets the chart scroll sideways instead of stretching a grid/flex parent */
  --sc-surface: #fcfcfb;
  --sc-ink: #0b0b0b;
  --sc-ink-2: #52514e;
  --sc-muted: #898781;
  --sc-grid: #e1e0d9;
  --sc-axis: #c3c2b7;
  --sc-accent: #42145f;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--sc-ink);
  background: var(--sc-surface);
  border-radius: 16px;
  padding: 16px;
}
.spend-chart .sc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.spend-chart .sc-title { font-size: 18px; margin: 0; }
.spend-chart .sc-error { color: #b42318; }
.spend-chart .sc-sub { margin: 2px 0 0; color: var(--sc-ink-2); font-size: 14px; }
.spend-chart .sc-scale { display: inline-flex; background: #f3edf7; border-radius: 999px; padding: 3px; }
.spend-chart .sc-scale button {
  border: 0; background: transparent; color: var(--sc-ink-2); font: inherit; font-size: 14px;
  padding: 6px 14px; border-radius: 999px; cursor: pointer;
}
.spend-chart .sc-scale button.on { background: var(--sc-accent); color: #fff; font-weight: 600; }
.spend-chart .sc-legend { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0; margin: 14px 0 6px; font-size: 13px; color: var(--sc-ink-2); }
.spend-chart .sc-legend li { display: flex; align-items: center; }
.spend-chart .sc-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; flex: none; }
.spend-chart .sc-area { position: relative; }
.spend-chart .sc-scroll { overflow-x: auto; }
.spend-chart .sc-plot { position: relative; }
.spend-chart svg { display: block; }
.spend-chart .sc-grid { stroke: var(--sc-grid); stroke-width: 1; }
.spend-chart .sc-baseline { stroke: var(--sc-axis); stroke-width: 1; }
.spend-chart .sc-tick { fill: var(--sc-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.spend-chart .sc-flag { fill: var(--sc-ink); font-size: 12px; font-weight: 700; pointer-events: none; }
.spend-chart .sc-tip {
  position: absolute; z-index: 1; pointer-events: none;
  background: #fff; border: 1px solid rgba(11,11,11,0.10); border-radius: 10px;
  box-shadow: 0 6px 20px rgba(11,11,11,0.12); padding: 10px 12px; font-size: 13px;
}
.spend-chart .sc-tip-period { color: var(--sc-ink-2); }
.spend-chart .sc-tip-total { font-size: 18px; font-weight: 700; margin: 2px 0 4px; }
.spend-chart .sc-tip-status { display: flex; align-items: center; color: var(--sc-ink-2); margin-bottom: 4px; }
.spend-chart .sc-tip-item { display: flex; justify-content: space-between; gap: 8px; color: var(--sc-ink); }
.spend-chart .sc-legend-mark { margin-right: 6px; flex: none; }
.spend-chart .sc-mark-count { fill: var(--sc-accent); font-size: 10px; font-weight: 700; }
.spend-chart .sc-tip-anoms { border-top: 1px solid var(--sc-grid); margin-top: 8px; padding-top: 6px; }
.spend-chart .sc-tip-heading { font-weight: 600; margin-bottom: 4px; }
.spend-chart .sc-tip-anom { margin-bottom: 4px; }
.spend-chart .sc-tip-anom-title { display: flex; align-items: center; gap: 6px; }
.spend-chart .sc-tip-anom-detail { color: var(--sc-ink-2); font-size: 12px; }
.spend-chart .sc-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding-top: 8px; }
.spend-chart .sc-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--sc-ink-2); cursor: pointer; }
.spend-chart .sc-toggle input { accent-color: var(--sc-accent); }
.spend-chart .sc-link { border: 0; background: none; color: var(--sc-accent); font: inherit; font-size: 13px; padding: 0; cursor: pointer; text-decoration: underline; }
.spend-chart .sc-table-wrap { max-height: 300px; overflow: auto; }
.spend-chart .sc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.spend-chart .sc-table th, .spend-chart .sc-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--sc-grid); }
.spend-chart .sc-table th { color: var(--sc-ink-2); font-weight: 600; position: sticky; top: 0; background: var(--sc-surface); }
.spend-chart .sc-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.spend-chart .sc-cell-status { display: inline-flex; align-items: center; }
`;
