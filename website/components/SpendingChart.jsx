import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnomalyMarker,
  barPath,
  CHART_CSS,
  ChartMessage,
  DAY_MS,
  MONTHS,
  niceTicks,
  pounds,
  poundsShort,
  SEVERITY,
  severityRank,
} from "./chartShared.jsx";
import { DEFAULT_STATEMENT_URL, useStatement } from "./csvData.js";

// One chart of spending over time, read from the bank statement:
// - bars: how much was spent in each day / week / month, split into flagged, pre-approved and other purchases
// - a moving average of day-to-day spending (solid line)
// - expected day-to-day spending from the anomaly detection (dashed line)
// - markers under days the anomaly detection marked as unusual
// Bills (direct debits and standing orders) are hidden by default so a £650 rent payment doesn't
// squash everything else; when hidden, the bars and both lines all measure the same thing.

const SCALES = [
  { id: "day", label: "Day", lines: true, avgWindow: 7, avgLabel: "7-day average" },
  { id: "week", label: "Week", lines: true, avgWindow: 4, avgLabel: "4-week average" },
  // Only a few months, two of them partial, so the lines would mislead: just bars.
  { id: "month", label: "Month", lines: false, avgWindow: null, avgLabel: null },
];

// Bar segments, bottom to top. Blue and red checked for colour blindness with the dataviz
// validator; grey is the neutral "nothing special" colour. Bills count as pre-approved.
const SEGMENTS = [
  { key: "other", label: "Other spending", color: "#a8a69e" },
  { key: "preApproved", label: "Pre-approved", color: "#2a78d6" },
  { key: "flagged", label: "Flagged", color: "#d03b3b" },
];
const AVG_COLOR = "#1d1d1f"; // ink, so it can't be mistaken for a bar colour
const EXPECTED_COLOR = "#1baf7a"; // aqua, also checked against the bar colours; drawn dashed

const BILL_TYPES = new Set(["D/D", "S/O"]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseLocal = (s) => new Date(s.length === 10 ? `${s}T00:00` : s); // local time, not UTC
const segmentOf = (p) => (p.flagged ? "flagged" : p.preApproved ? "preApproved" : "other");

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
  if (scale === "day") return long ? `${WEEKDAYS[d.getDay()]} ${dm} ${d.getFullYear()}` : dm;
  if (scale === "week") {
    if (!long) return dm;
    const end = new Date(d.getTime() + 6 * DAY_MS);
    return `${dm} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
  }
  return long ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()];
}

// Groups everything into periods. Periods with no spending are kept so time stays evenly spaced.
function buildBuckets({ purchases, days, anomalies }, scale, includeBills, { lines: showLines, avgWindow }) {
  if (days.length === 0) return [];
  const first = periodStart(parseLocal(days[0].date), scale);
  const last = periodStart(parseLocal(days[days.length - 1].date), scale);

  const byKey = new Map();
  for (let d = first; d <= last; d = nextPeriod(d, scale)) {
    byKey.set(d.getTime(), {
      start: d,
      other: 0,
      preApproved: 0,
      flagged: 0,
      bills: 0,
      dayToDay: 0, // spending excluding bills: what the lines measure
      items: [],
      days: [],
      anomalies: [],
    });
  }
  const bucketOf = (date) => byKey.get(periodStart(parseLocal(date), scale).getTime());

  for (const p of purchases) {
    const b = bucketOf(p.date);
    const isBill = BILL_TYPES.has(p.type);
    if (isBill) b.bills += p.amount;
    else b.dayToDay += p.amount;
    if (isBill && !includeBills) continue;
    b[segmentOf(p)] += p.amount;
    b.items.push(p);
  }
  for (const d of days) bucketOf(d.date).days.push(d);
  for (const a of anomalies) bucketOf(a.date)?.anomalies.push(a);

  const buckets = [...byKey.values()].map((b) => ({
    ...b,
    total: b.other + b.preApproved + b.flagged,
    // Expected spending for the period: the sum of each day's expected amount,
    // or nothing if any day in it didn't have enough history.
    expected:
      showLines && b.days.length && b.days.every((d) => d.baseline != null) ? b.days.reduce((s, d) => s + d.baseline, 0) : null,
    anomalies: b.anomalies.sort((x, y) => severityRank(x.classification) - severityRank(y.classification) || y.score - x.score),
  }));

  // Moving average of day-to-day spending over the last `avgWindow` periods (including this one).
  buckets.forEach((b, i) => {
    b.average = showLines && avgWindow && i >= avgWindow - 1
      ? buckets.slice(i - avgWindow + 1, i + 1).reduce((s, x) => s + x.dayToDay, 0) / avgWindow
      : null;
  });
  return buckets;
}

// SVG path for a line, with gaps wherever the value is null.
function linePath(points) {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
    pen = true;
  }
  return d;
}

// Loads the statement CSV and works out the analysis from it, then draws the chart.
// Pass `data` (the output of analyseStatement) to skip loading the file.
export default function SpendingChart({ data, statementUrl = DEFAULT_STATEMENT_URL, initialScale = "day" }) {
  const loaded = useStatement(data ? null : statementUrl);
  const d = data ?? loaded.data;
  if (loaded.error || !d) return <ChartMessage title="Spending" error={loaded.error} />;
  return <SpendingChartView data={d} initialScale={initialScale} />;
}

function SpendingChartView({ data, initialScale }) {
  const [scale, setScale] = useState(initialScale);
  const [includeBills, setIncludeBills] = useState(false);
  const [showUnusual, setShowUnusual] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const wrapRef = useRef(null);
  const [wrapWidth, setWrapWidth] = useState(600);
  const [scrollX, setScrollX] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWrapWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showTable]);

  const scaleInfo = SCALES.find((s) => s.id === scale);
  const buckets = useMemo(
    () => buildBuckets(data, scale, includeBills, scaleInfo),
    [data, scale, includeBills, scaleInfo]
  );

  const dayToDayTotal = data.purchases.filter((p) => !BILL_TYPES.has(p.type)).reduce((s, p) => s + p.amount, 0);
  const billsTotal = data.purchases.filter((p) => BILL_TYPES.has(p.type)).reduce((s, p) => s + p.amount, 0);
  const presentSegments = SEGMENTS.filter((s) => buckets.some((b) => b[s.key] > 0));
  const presentSeverities = SEVERITY.filter((sev) => data.anomalies.some((a) => a.classification === sev.classification));
  const hasAverage = buckets.some((b) => b.average != null);
  const hasExpected = buckets.some((b) => b.expected != null);

  // Layout. If there are too many bars to fit, the chart gets wider and scrolls sideways.
  const laneH = showUnusual ? 18 : 0; // strip under the bars for unusual-day markers
  const margin = { top: 16, right: 84, bottom: 28 + laneH, left: 48 };
  const height = 300;
  const minSlot = 5;
  const plotW = Math.max(wrapWidth - margin.left - margin.right, buckets.length * minSlot);
  const plotH = height - margin.top - margin.bottom;
  const width = plotW + margin.left + margin.right;
  const slot = plotW / Math.max(buckets.length, 1);
  const gap = Math.max(1, Math.min(slot * 0.25, 16));
  const barW = slot - gap;

  const maxVal = Math.max(0, ...buckets.map((b) => Math.max(b.total, b.average ?? 0, b.expected ?? 0)));
  const ticks = niceTicks(maxVal);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v) => margin.top + plotH - (v / yMax) * plotH;
  const cx = (i) => margin.left + i * slot + slot / 2;

  const avgPoints = buckets.map((b, i) => (b.average == null ? null : { x: cx(i), y: y(b.average) }));
  const expPoints = buckets.map((b, i) => (b.expected == null ? null : { x: cx(i), y: y(b.expected) }));

  // Label each line at its right-hand end, nudged apart if they would overlap.
  const lastOf = (pts) => [...pts].reverse().find(Boolean);
  const endLabels = [
    { key: "avg", text: "Average", color: AVG_COLOR, pt: lastOf(avgPoints) },
    { key: "exp", text: "Expected", color: EXPECTED_COLOR, pt: lastOf(expPoints) },
  ].filter((l) => l.pt);
  if (endLabels.length === 2 && Math.abs(endLabels[0].pt.y - endLabels[1].pt.y) < 14) {
    const [upper, lower] = endLabels[0].pt.y <= endLabels[1].pt.y ? endLabels : [endLabels[1], endLabels[0]];
    const mid = (upper.pt.y + lower.pt.y) / 2;
    upper.labelY = mid - 7;
    lower.labelY = mid + 7;
  }

  // X labels: about one per 56px. In Day view, put them on Mondays.
  const labelEvery = scale === "day" ? Math.max(7, Math.ceil(56 / slot / 7) * 7) : Math.max(1, Math.ceil(56 / slot));
  const firstLabel = scale === "day" ? Math.max(0, buckets.findIndex((b) => b.start.getDay() === 1)) : 0;

  const hb = hovered != null ? buckets[hovered] : null;
  const tipW = 240;
  const visibleCentre = hb ? cx(hovered) - scrollX : 0; // the tooltip sits outside the scroll area
  const tipLeft = visibleCentre + slot / 2 + tipW + 8 <= wrapWidth
    ? visibleCentre + slot / 2 + 6
    : visibleCentre - slot / 2 - tipW - 6;

  const pickScale = (id) => {
    setScale(id);
    setHovered(null);
    setScrollX(0);
  };

  return (
    <div className="spend-chart">
      <style>{CHART_CSS}</style>
      <style>{COMBINED_CSS}</style>

      <div className="sc-head">
        <div>
          <h2 className="sc-title">Spending</h2>
          <p className="sc-sub">
            {pounds(dayToDayTotal)} day-to-day · {pounds(billsTotal)} on bills
            {showUnusual && <> · {data.anomalies.length} unusual days</>}
          </p>
        </div>
        <div className="sc-scale" role="radiogroup" aria-label="Time scale">
          {SCALES.map((s) => (
            <button key={s.id} role="radio" aria-checked={scale === s.id} className={scale === s.id ? "on" : ""} onClick={() => pickScale(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="sc-legend">
        {presentSegments.map((s) => (
          <li key={s.key}>
            <span className="sc-swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        {hasAverage && (
          <li>
            <svg width="20" height="10" className="sc-legend-mark" aria-hidden="true">
              <line x1="1" x2="19" y1="5" y2="5" stroke={AVG_COLOR} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {scaleInfo.avgLabel}
          </li>
        )}
        {hasExpected && (
          <li>
            <svg width="20" height="10" className="sc-legend-mark" aria-hidden="true">
              <line x1="1" x2="19" y1="5" y2="5" stroke={EXPECTED_COLOR} strokeWidth="2.5" strokeDasharray="4 3" />
            </svg>
            Expected
          </li>
        )}
        {showUnusual &&
          presentSeverities.map((sev) => (
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
                <th scope="col">{scaleInfo.label}</th>
                <th scope="col" className="num">Spent</th>
                <th scope="col" className="num">Flagged</th>
                <th scope="col" className="num">Pre-approved</th>
                {hasAverage && <th scope="col" className="num">Average</th>}
                {hasExpected && <th scope="col" className="num">Expected</th>}
                {showUnusual && <th scope="col">Unusual</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start.getTime()}>
                  <td>{periodLabel(b.start, scale, true)}</td>
                  <td className="num">{pounds(b.total)}</td>
                  <td className="num">{b.flagged ? pounds(b.flagged) : "–"}</td>
                  <td className="num">{b.preApproved ? pounds(b.preApproved) : "–"}</td>
                  {hasAverage && <td className="num">{b.average == null ? "–" : pounds(b.average)}</td>}
                  {hasExpected && <td className="num">{b.expected == null ? "–" : pounds(b.expected)}</td>}
                  {showUnusual && (
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
                    <line x1={margin.left} x2={margin.left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? "sc-baseline" : "sc-grid"} />
                    <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="sc-tick">
                      {poundsShort(t)}
                    </text>
                  </g>
                ))}

                {hb && <rect x={margin.left + hovered * slot} y={margin.top} width={slot} height={plotH} className="cc-hover-band" />}

                {buckets.map((b, i) => {
                  const x = margin.left + i * slot + gap / 2;
                  // Stack the segments, leaving a 1–2px gap between them; only the top one gets rounded corners.
                  const shown = SEGMENTS.filter((s) => b[s.key] > 0);
                  const segGap = barW >= 6 ? 2 : 1;
                  let base = b.total;
                  const sev = b.anomalies.length ? SEVERITY[severityRank(b.anomalies[0].classification)] : null;
                  return (
                    <g key={b.start.getTime()}>
                      {[...shown].reverse().map((s, k) => {
                        const top = y(base);
                        base -= b[s.key];
                        const h = y(base) - top - (k < shown.length - 1 ? segGap : 0);
                        if (h <= 0.3) return null;
                        return k === 0 ? (
                          <path key={s.key} d={barPath(x, top, barW, h, Math.min(4, barW / 2))} fill={s.color} />
                        ) : (
                          <rect key={s.key} x={x} y={top} width={barW} height={h} fill={s.color} />
                        );
                      })}
                      {showUnusual && sev && (
                        <g>
                          <AnomalyMarker
                            x={cx(i) - (b.anomalies.length > 1 ? 5 : 0)}
                            y={margin.top + plotH + laneH / 2 + 1}
                            shape={sev.shape}
                            size={Math.min(5, slot / 2 + 1)}
                          />
                          {b.anomalies.length > 1 && (
                            <text x={cx(i) + 2} y={margin.top + plotH + laneH / 2 + 1} dy="0.35em" className="sc-mark-count">
                              {b.anomalies.length}
                            </text>
                          )}
                        </g>
                      )}
                      {i >= firstLabel && (i - firstLabel) % labelEvery === 0 && (
                        <text x={cx(i)} y={height - 8} textAnchor="middle" className="sc-tick">
                          {periodLabel(b.start, scale)}
                        </text>
                      )}
                    </g>
                  );
                })}

                <path d={linePath(expPoints)} className="cc-line" stroke={EXPECTED_COLOR} strokeDasharray="6 4" />
                <path d={linePath(avgPoints)} className="cc-line cc-halo" />
                <path d={linePath(avgPoints)} className="cc-line" stroke={AVG_COLOR} strokeWidth="2.5" />

                {endLabels.map((l) => (
                  <text key={l.key} x={l.pt.x + 8} y={l.labelY ?? l.pt.y} dy="0.32em" className="cc-end-label">
                    <tspan fill={l.color}>●</tspan> {l.text}
                  </text>
                ))}

                {hb && (
                  <g pointerEvents="none">
                    {hb.expected != null && <circle cx={cx(hovered)} cy={y(hb.expected)} r={4} fill={EXPECTED_COLOR} className="cc-dot" />}
                    {hb.average != null && <circle cx={cx(hovered)} cy={y(hb.average)} r={4} fill={AVG_COLOR} className="cc-dot" />}
                  </g>
                )}

                {/* Invisible full-height hover targets, so thin bars are easy to hover. */}
                {buckets.map((b, i) => (
                  <rect
                    key={b.start.getTime()}
                    x={margin.left + i * slot}
                    y={margin.top}
                    width={slot}
                    height={plotH + laneH}
                    fill="transparent"
                    onMouseEnter={() => setHovered(i)}
                  />
                ))}
              </svg>
            </div>
          </div>

          {hb && <Tooltip b={hb} scale={scale} scaleInfo={scaleInfo} includeBills={includeBills} showUnusual={showUnusual} left={Math.max(tipLeft, 0)} top={margin.top} width={tipW} />}
        </div>
      )}

      <div className="sc-foot">
        <button className="sc-link" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show as chart" : "Show as table"}
        </button>
        <div className="cc-toggles">
          <label className="sc-toggle">
            <input type="checkbox" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
            Include bills
          </label>
          <label className="sc-toggle">
            <input type="checkbox" checked={showUnusual} onChange={(e) => setShowUnusual(e.target.checked)} />
            Show unusual days
          </label>
        </div>
      </div>
    </div>
  );
}

function Tooltip({ b, scale, scaleInfo, includeBills, showUnusual, left, top, width }) {
  const notable = b.items.filter((p) => p.flagged || p.preApproved);
  return (
    <div className="sc-tip" style={{ left, top, width }}>
      <div className="sc-tip-period">{periodLabel(b.start, scale, true)}</div>
      <div className="sc-tip-total">{pounds(b.total)}</div>

      {SEGMENTS.filter((s) => b[s.key] > 0).length > 1 &&
        [...SEGMENTS].reverse().filter((s) => b[s.key] > 0).map((s) => (
          <div key={s.key} className="cc-row">
            <span>
              <span className="sc-swatch" style={{ background: s.color }} />
              {s.label}
            </span>
            <span>{pounds(b[s.key])}</span>
          </div>
        ))}
      {!includeBills && b.bills > 0 && <div className="cc-note">Plus {pounds(b.bills)} on bills (hidden)</div>}

      {(b.average != null || b.expected != null) && (
        <div className="cc-section">
          {b.average != null && (
            <div className="cc-row">
              <span>
                <span className="cc-key" style={{ background: AVG_COLOR }} />
                {scaleInfo.avgLabel}
              </span>
              <span>{pounds(b.average)}</span>
            </div>
          )}
          {b.expected != null && (
            <div className="cc-row">
              <span>
                <span className="cc-key cc-key-dashed" style={{ borderColor: EXPECTED_COLOR }} />
                Expected
              </span>
              <span>{pounds(b.expected)}</span>
            </div>
          )}
        </div>
      )}

      {notable.length > 0 && (
        <div className="cc-section">
          {notable.slice(0, 4).map((p, k) => (
            <div key={k} className="sc-tip-item">
              <span>
                {p.flagged ? "! " : "✓ "}
                {p.description}
              </span>
              <span>{pounds(p.amount)}</span>
            </div>
          ))}
          {notable.length > 4 && <div className="cc-note">+ {notable.length - 4} more</div>}
        </div>
      )}

      {showUnusual && b.anomalies.length > 0 && (
        <div className="cc-section">
          {b.anomalies.slice(0, 2).map((a) => (
            <div key={a.date} className="sc-tip-anom">
              <div className="sc-tip-anom-title">
                <svg width="12" height="12" aria-hidden="true">
                  <AnomalyMarker x={6} y={6.5} shape={SEVERITY[severityRank(a.classification)].shape} size={4.5} />
                </svg>
                {scale === "day" ? a.classification : `${periodLabel(parseLocal(a.date), "day")}: ${a.classification.toLowerCase()}`}
              </div>
              <div className="sc-tip-anom-detail">
                {pounds(a.actual)} spent, {pounds(a.expected)} expected · biggest: {a.largestTransaction}
              </div>
            </div>
          ))}
          {b.anomalies.length > 2 && <div className="cc-note">+ {b.anomalies.length - 2} more unusual days</div>}
        </div>
      )}
    </div>
  );
}

const COMBINED_CSS = `
.spend-chart .cc-line { fill: none; stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: round; pointer-events: none; }
.spend-chart .cc-halo { stroke: var(--sc-surface); stroke-width: 5.5; }
.spend-chart .cc-hover-band { fill: rgba(11, 11, 11, 0.05); pointer-events: none; }
.spend-chart .cc-dot { stroke: var(--sc-surface); stroke-width: 2; }
.spend-chart .cc-end-label { fill: var(--sc-ink-2); font-size: 12px; font-weight: 600; }
.spend-chart .cc-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
.spend-chart .cc-row > span:first-child { display: flex; align-items: center; color: var(--sc-ink-2); }
.spend-chart .cc-key { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 6px; }
.spend-chart .cc-key-dashed { height: 0; border-top: 2.5px dashed; background: none; border-radius: 0; }
.spend-chart .cc-section { border-top: 1px solid var(--sc-grid); margin-top: 8px; padding-top: 6px; }
.spend-chart .cc-note { color: var(--sc-ink-2); font-size: 12px; margin-top: 2px; }
.spend-chart .cc-toggles { display: flex; gap: 16px; flex-wrap: wrap; }
`;
