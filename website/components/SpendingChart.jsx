import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnomalyMarker, barPath, ChartMessage, DAY_MS, MONTHS, niceTicks, pounds, poundsShort, SEVERITY, severityRank, CHART_CSS } from "./chartShared.jsx";
import { DEFAULT_STATEMENT_URL, useStatement } from "./csvData.js";

// Bar chart of how much was spent in each day / week / month.
// A bar's colour shows whether any purchase in that period was flagged and/or pre-approved.
// Days the anomaly detection marked as unusual get a marker in a strip under the bars.

const SCALES = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

// Colours checked for colour blindness with the dataviz validator (light mode).
// Colour is never the only signal: there is a legend, a "!" above flagged bars,
// a tooltip that names the status, and a table view.
const STATUS = {
  neither: { label: "No flags", color: "#898781" },
  preApproved: { label: "Pre-approved", color: "#2a78d6" },
  flagged: { label: "Flagged", color: "#d03b3b" },
  both: { label: "Flagged + pre-approved", color: "#eda100" },
};
const STATUS_ORDER = ["neither", "preApproved", "flagged", "both"];

// Start of the period that a date falls in. Weeks start on Monday, like UK bank apps.
function periodStart(date, scale) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (scale === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (scale === "month") d.setDate(1);
  return d;
}

function nextPeriod(d, scale) {
  const n = new Date(d);
  if (scale === "day") n.setDate(n.getDate() + 1);
  if (scale === "week") n.setDate(n.getDate() + 7);
  if (scale === "month") n.setMonth(n.getMonth() + 1);
  return n;
}

function periodLabel(d, scale, long = false) {
  const dm = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (scale === "day") return long ? `${dm} ${d.getFullYear()}` : dm;
  if (scale === "week") {
    if (!long) return dm;
    const end = new Date(d.getTime() + 6 * DAY_MS);
    return `${dm} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  }
  return long ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()];
}

// Group purchases into periods. Periods with no spending are kept (as £0) so time stays evenly spaced.
function buildBuckets(purchases, anomalies, scale) {
  if (purchases.length === 0) return [];
  const dates = purchases.map((p) => new Date(p.date));
  const first = periodStart(new Date(Math.min(...dates)), scale);
  const last = periodStart(new Date(Math.max(...dates)), scale);

  const byKey = new Map();
  for (let d = first; d <= last; d = nextPeriod(d, scale)) {
    byKey.set(d.getTime(), { start: d, total: 0, items: [], anomalies: [], flagged: false, preApproved: false });
  }
  purchases.forEach((p, i) => {
    const b = byKey.get(periodStart(dates[i], scale).getTime());
    b.total += p.amount;
    b.items.push(p);
    b.flagged ||= p.flagged;
    b.preApproved ||= p.preApproved;
  });
  for (const a of anomalies) {
    // "T00:00" so the date is read as local midnight, not UTC.
    const b = byKey.get(periodStart(new Date(`${a.date}T00:00`), scale).getTime());
    if (b) b.anomalies.push(a);
  }

  return [...byKey.values()].map((b) => ({
    ...b,
    anomalies: b.anomalies.sort((x, y) => severityRank(x.classification) - severityRank(y.classification) || y.score - x.score),
    status: b.flagged && b.preApproved ? "both" : b.flagged ? "flagged" : b.preApproved ? "preApproved" : "neither",
  }));
}

// Loads the statement CSV and works out the unusual days from it, then draws the chart.
// Pass both `purchases` and `anomalies` to skip loading the file.
export default function SpendingChart({ purchases, anomalies, statementUrl = DEFAULT_STATEMENT_URL, initialScale = "week" }) {
  const haveProps = purchases != null && anomalies != null;
  const { data, error } = useStatement(haveProps ? null : statementUrl);
  const p = haveProps ? purchases : data?.purchases;
  const a = haveProps ? anomalies : data?.anomalies;

  if (error || !p || !a) return <ChartMessage title="Spending over time" error={error} />;
  return <SpendingChartView purchases={p} anomalies={a} initialScale={initialScale} />;
}

function SpendingChartView({ purchases, anomalies, initialScale }) {
  const [scale, setScale] = useState(initialScale);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const wrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(600);
  const [scrollX, setScrollX] = useState(0); // how far the Day view is scrolled sideways

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showTable]);

  const spending = useMemo(() => purchases.filter((p) => p.amount > 0), [purchases]);
  const shownAnomalies = useMemo(() => (showAnomalies ? anomalies : []), [anomalies, showAnomalies]);
  const buckets = useMemo(() => buildBuckets(spending, shownAnomalies, scale), [spending, shownAnomalies, scale]);
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const present = STATUS_ORDER.filter((s) => buckets.some((b) => b.status === s));
  const presentSeverities = SEVERITY.filter((sev) => shownAnomalies.some((a) => a.classification === sev.classification));

  // Layout. If there are too many bars to fit, the chart gets wider and scrolls sideways.
  const laneH = showAnomalies ? 18 : 0; // strip under the bars for anomaly markers
  const margin = { top: 20, right: 8, bottom: 28 + laneH, left: 48 };
  const height = 240 + laneH;
  const minSlot = 10;
  const plotW = Math.max(wrapWidth - margin.left - margin.right, buckets.length * minSlot);
  const plotH = height - margin.top - margin.bottom;
  const width = plotW + margin.left + margin.right;
  const slot = plotW / Math.max(buckets.length, 1);
  const gap = Math.max(2, Math.min(slot * 0.3, 16));
  const barW = slot - gap;

  const ticks = niceTicks(Math.max(...buckets.map((b) => b.total), 0));
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v) => margin.top + plotH - (v / yMax) * plotH;

  // Only label as many x ticks as fit (about one per 56px).
  const labelEvery = Math.max(1, Math.ceil(56 / slot));

  const hb = hovered != null ? buckets[hovered] : null;
  // Put the tooltip beside the bar (right of it in the left half, left of it otherwise),
  // so it never covers the bar or gets clipped by the scroll area.
  const tipW = 220;
  const barCentre = hb ? margin.left + hovered * slot + slot / 2 : 0;
  const visibleCentre = barCentre - scrollX; // the tooltip sits outside the scroll area
  const tipLeft = visibleCentre + slot / 2 + tipW + 8 <= wrapWidth
    ? visibleCentre + slot / 2 + 4
    : visibleCentre - slot / 2 - tipW - 4;

  return (
    <div className="spend-chart">
      <style>{CHART_CSS}</style>

      <div className="sc-head">
        <div>
          <h2 className="sc-title">Spending over time</h2>
          <p className="sc-sub">
            {pounds(total)} spent · {spending.length} purchases
          </p>
        </div>
        <div className="sc-scale" role="radiogroup" aria-label="Time scale">
          {SCALES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={scale === s.id}
              className={scale === s.id ? "on" : ""}
              onClick={() => {
                setScale(s.id);
                setHovered(null);
                setScrollX(0);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="sc-legend">
        {present.map((s) => (
          <li key={s}>
            <span className="sc-swatch" style={{ background: STATUS[s].color }} />
            {STATUS[s].label}
          </li>
        ))}
        {presentSeverities.map((sev) => (
          <li key={sev.classification}>
            <svg width="12" height="12" className="sc-legend-mark" aria-hidden="true">
              <AnomalyMarker x={6} y={6.5} shape={sev.shape} size={4.5} />
            </svg>
            {sev.label}
          </li>
        ))}
      </ul>

      {showTable ? (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">{SCALES.find((s) => s.id === scale).label}</th>
                <th scope="col" className="num">Spent</th>
                <th scope="col" className="num">Purchases</th>
                <th scope="col">Status</th>
                {showAnomalies && <th scope="col">Unusual spending</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start.getTime()}>
                  <td>{periodLabel(b.start, scale, true)}</td>
                  <td className="num">{pounds(b.total)}</td>
                  <td className="num">{b.items.length}</td>
                  <td>
                    <span className="sc-cell-status">
                      <span className="sc-swatch" style={{ background: STATUS[b.status].color }} />
                      {STATUS[b.status].label}
                    </span>
                  </td>
                  {showAnomalies && (
                    <td>
                      {b.anomalies.length === 0
                        ? "–"
                        : b.anomalies.length === 1
                          ? b.anomalies[0].classification
                          : `${b.anomalies.length} days (worst: ${b.anomalies[0].classification.toLowerCase()})`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sc-area">
        <div className="sc-scroll" ref={wrapRef} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
          <div className="sc-plot" style={{ width }}>
            <svg
              width={width}
              height={height}
              role="img"
              aria-label={`Bar chart of spending per ${scale}. Use "Show as table" for the numbers.`}
              onMouseLeave={() => setHovered(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={margin.left}
                    x2={width - margin.right}
                    y1={y(t)}
                    y2={y(t)}
                    className={t === 0 ? "sc-baseline" : "sc-grid"}
                  />
                  <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="sc-tick">
                    {poundsShort(t)}
                  </text>
                </g>
              ))}

              {buckets.map((b, i) => {
                const x = margin.left + i * slot + gap / 2;
                const h = (b.total / yMax) * plotH;
                const dim = hovered != null && hovered !== i;
                return (
                  <g key={b.start.getTime()}>
                    {h > 0 && (
                      <path
                        d={barPath(x, y(b.total), barW, h)}
                        fill={STATUS[b.status].color}
                        opacity={dim ? 0.45 : 1}
                      />
                    )}
                    {b.flagged && (
                      <text x={x + barW / 2} y={y(b.total) - 5} textAnchor="middle" className="sc-flag">
                        !
                      </text>
                    )}
                    {b.anomalies.length > 0 && (
                      <g>
                        <AnomalyMarker
                          x={x + barW / 2 - (b.anomalies.length > 1 ? 5 : 0)}
                          y={margin.top + plotH + laneH / 2 + 1}
                          shape={SEVERITY[severityRank(b.anomalies[0].classification)].shape}
                        />
                        {b.anomalies.length > 1 && (
                          <text x={x + barW / 2 + 2} y={margin.top + plotH + laneH / 2 + 1} dy="0.35em" className="sc-mark-count">
                            {b.anomalies.length}
                          </text>
                        )}
                      </g>
                    )}
                    {i % labelEvery === 0 && (
                      <text x={x + barW / 2} y={height - 8} textAnchor="middle" className="sc-tick">
                        {periodLabel(b.start, scale)}
                      </text>
                    )}
                    {/* Invisible full-height target so thin bars are easy to hover. */}
                    <rect
                      x={margin.left + i * slot}
                      y={margin.top}
                      width={slot}
                      height={plotH + laneH}
                      fill="transparent"
                      onMouseEnter={() => setHovered(i)}
                    />
                  </g>
                );
              })}
            </svg>

          </div>
        </div>
          {hb && (
            <div
              className="sc-tip"
              style={{ left: Math.max(tipLeft, 0), top: margin.top, width: tipW }}
            >
              <div className="sc-tip-period">{periodLabel(hb.start, scale, true)}</div>
              <div className="sc-tip-total">{pounds(hb.total)}</div>
              <div className="sc-tip-status">
                <span className="sc-swatch" style={{ background: STATUS[hb.status].color }} />
                {STATUS[hb.status].label} · {hb.items.length} purchase{hb.items.length === 1 ? "" : "s"}
              </div>
              {hb.items
                .filter((p) => p.flagged || p.preApproved)
                .slice(0, 5)
                .map((p, k) => (
                  <div key={k} className="sc-tip-item">
                    <span>
                      {p.flagged ? "! " : "✓ "}
                      {p.description}
                    </span>
                    <span>{pounds(p.amount)}</span>
                  </div>
                ))}
              {hb.anomalies.length > 0 && (
                <div className="sc-tip-anoms">
                  <div className="sc-tip-heading">Unusual spending</div>
                  {hb.anomalies.slice(0, 2).map((a) => (
                    <div key={a.date} className="sc-tip-anom">
                      <div className="sc-tip-anom-title">
                        <svg width="12" height="12" aria-hidden="true">
                          <AnomalyMarker x={6} y={6.5} shape={SEVERITY[severityRank(a.classification)].shape} size={4.5} />
                        </svg>
                        {scale === "day" ? a.classification : `${periodLabel(new Date(`${a.date}T00:00`), "day")}: ${a.classification.toLowerCase()}`}
                      </div>
                      <div className="sc-tip-anom-detail">
                        {pounds(a.actual)} spent, {pounds(a.expected)} expected
                          <br />
                          Biggest: {a.largestTransaction}
                      </div>
                    </div>
                  ))}
                  {hb.anomalies.length > 2 && (
                    <div className="sc-tip-anom-detail">+ {hb.anomalies.length - 2} more unusual day{hb.anomalies.length - 2 === 1 ? "" : "s"}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sc-foot">
        <button className="sc-link" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show as chart" : "Show as table"}
        </button>
        <label className="sc-toggle">
          <input type="checkbox" checked={showAnomalies} onChange={(e) => setShowAnomalies(e.target.checked)} />
          Show unusual spending
        </label>
      </div>
    </div>
  );
}
