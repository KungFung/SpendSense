import React, { useEffect, useMemo, useRef, useState } from "react";
import { dailyAnalysis as defaultDays } from "./dailyAnalysisData.js";
import {
  AnomalyMarker,
  barPath,
  CHART_CSS,
  MONTHS,
  niceTicks,
  pounds,
  poundsShort,
  SEVERITY,
  severityRank,
} from "./chartShared.jsx";

// Day-to-day spending (bills left out), with:
// - a moving average of that spending (window chosen by the user, worked out here)
// - the anomaly detection's "expected spending" baseline (a rolling median from the script)
// - markers under days the detection marked as unusual

const WINDOWS = [7, 14, 28];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Categorical slots 1 and 2 from the dataviz palette (checked for colour blindness).
// The baseline line is also dashed, so the two lines differ by more than colour.
const AVG_COLOR = "#2a78d6";
const BASELINE_COLOR = "#eb6834";
const BAR_COLOR = "#cfcdc6";

const parseDay = (s) => new Date(`${s}T00:00`); // local midnight, not UTC
const shortDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const longDate = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

// Average of the last `window` days, including today. null until there are enough days.
function movingAverage(values, window) {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= window) sum -= values[i - window];
    return i >= window - 1 ? sum / window : null;
  });
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

export default function SpendingTrendChart({ days = defaultDays, initialWindow = 7 }) {
  const [windowDays, setWindowDays] = useState(initialWindow);
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

  const rows = useMemo(() => {
    const avg = movingAverage(days.map((d) => d.variable), windowDays);
    return days.map((d, i) => ({
      ...d,
      day: parseDay(d.date),
      average: avg[i],
      unusual: SEVERITY.some((s) => s.classification === d.classification),
    }));
  }, [days, windowDays]);

  const latestAvg = [...rows].reverse().find((r) => r.average != null)?.average;
  const unusualCount = rows.filter((r) => r.unusual).length;

  // Layout
  const laneH = 18; // strip under the bars for anomaly markers
  const margin = { top: 16, right: 96, bottom: 28 + laneH, left: 48 };
  const height = 280;
  const minSlot = 5;
  const plotW = Math.max(wrapWidth - margin.left - margin.right, rows.length * minSlot);
  const plotH = height - margin.top - margin.bottom;
  const width = plotW + margin.left + margin.right;
  const slot = plotW / Math.max(rows.length, 1);
  const gap = Math.max(1, Math.min(slot * 0.25, 6));
  const barW = slot - gap;

  const maxVal = Math.max(...rows.map((r) => Math.max(r.variable, r.baseline ?? 0, r.average ?? 0)), 0);
  const ticks = niceTicks(maxVal);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v) => margin.top + plotH - (v / yMax) * plotH;
  const cx = (i) => margin.left + i * slot + slot / 2;

  const avgPoints = rows.map((r, i) => (r.average == null ? null : { x: cx(i), y: y(r.average) }));
  const basePoints = rows.map((r, i) => (r.baseline == null ? null : { x: cx(i), y: y(r.baseline) }));

  // Label each line at its right-hand end, nudged apart if they would overlap.
  const lastOf = (pts) => [...pts].reverse().find(Boolean);
  const endLabels = [
    { key: "avg", text: `${windowDays}-day avg`, color: AVG_COLOR, pt: lastOf(avgPoints) },
    { key: "base", text: "Expected", color: BASELINE_COLOR, pt: lastOf(basePoints) },
  ].filter((l) => l.pt);
  if (endLabels.length === 2 && Math.abs(endLabels[0].pt.y - endLabels[1].pt.y) < 14) {
    const [upper, lower] = endLabels[0].pt.y <= endLabels[1].pt.y ? endLabels : [endLabels[1], endLabels[0]];
    const mid = (upper.pt.y + lower.pt.y) / 2;
    upper.labelY = mid - 7;
    lower.labelY = mid + 7;
  }

  // Only label as many x ticks as fit (about one per 56px), starting on a Monday.
  const labelEvery = Math.max(7, Math.ceil(56 / slot / 7) * 7);
  const firstMonday = rows.findIndex((r) => r.day.getDay() === 1);

  const hr = hovered != null ? rows[hovered] : null;
  const tipW = 230;
  const visibleCentre = hr ? cx(hovered) - scrollX : 0;
  const tipLeft =
    visibleCentre + tipW + 16 <= wrapWidth ? visibleCentre + 10 : visibleCentre - tipW - 10;

  return (
    <div className="spend-chart">
      <style>{CHART_CSS}</style>
      <style>{TREND_CSS}</style>

      <div className="sc-head">
        <div>
          <h2 className="sc-title">Day-to-day spending</h2>
          <p className="sc-sub">
            Bills left out
            {latestAvg != null && <> · averaging {pounds(latestAvg)} a day lately</>}
            {" · "}
            {unusualCount} unusual days
          </p>
        </div>
        <div className="sc-scale" role="radiogroup" aria-label="Moving average window">
          {WINDOWS.map((w) => (
            <button key={w} role="radio" aria-checked={windowDays === w} className={windowDays === w ? "on" : ""} onClick={() => setWindowDays(w)}>
              {w}-day avg
            </button>
          ))}
        </div>
      </div>

      <ul className="sc-legend">
        <li>
          <span className="sc-swatch" style={{ background: BAR_COLOR }} />
          Spent that day
        </li>
        <li>
          <svg width="20" height="10" className="sc-legend-mark" aria-hidden="true">
            <line x1="1" x2="19" y1="5" y2="5" stroke={AVG_COLOR} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          {windowDays}-day moving average
        </li>
        <li>
          <svg width="20" height="10" className="sc-legend-mark" aria-hidden="true">
            <line x1="1" x2="19" y1="5" y2="5" stroke={BASELINE_COLOR} strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Expected (anomaly detection)
        </li>
        {SEVERITY.map((sev) => (
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
                <th scope="col">Day</th>
                <th scope="col" className="num">Spent</th>
                <th scope="col" className="num">{windowDays}-day avg</th>
                <th scope="col" className="num">Expected</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date}>
                  <td>{longDate(r.day)}</td>
                  <td className="num">{pounds(r.variable)}</td>
                  <td className="num">{r.average == null ? "–" : pounds(r.average)}</td>
                  <td className="num">{r.baseline == null ? "–" : pounds(r.baseline)}</td>
                  <td>{r.classification}</td>
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
                aria-label={`Daily spending with a ${windowDays}-day moving average and expected spending. Use "Show as table" for the numbers.`}
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

                {hr && <line x1={cx(hovered)} x2={cx(hovered)} y1={margin.top} y2={margin.top + plotH} className="tc-crosshair" />}

                {rows.map((r, i) => {
                  const x = margin.left + i * slot + gap / 2;
                  const h = (r.variable / yMax) * plotH;
                  const sev = r.unusual ? SEVERITY[severityRank(r.classification)] : null;
                  return (
                    <g key={r.date}>
                      {h > 0 && <path d={barPath(x, y(r.variable), barW, h, Math.min(3, barW / 2))} fill={BAR_COLOR} />}
                      {sev && <AnomalyMarker x={cx(i)} y={margin.top + plotH + laneH / 2 + 1} shape={sev.shape} size={Math.min(5, slot / 2 + 1)} />}
                      {(i - firstMonday) % labelEvery === 0 && i >= firstMonday && (
                        <text x={cx(i)} y={height - 8} textAnchor="middle" className="sc-tick">
                          {shortDate(r.day)}
                        </text>
                      )}
                    </g>
                  );
                })}

                <path d={linePath(basePoints)} className="tc-line" stroke={BASELINE_COLOR} strokeDasharray="5 4" />
                <path d={linePath(avgPoints)} className="tc-line tc-line-avg" stroke={AVG_COLOR} />

                {endLabels.map((l) => (
                  <text key={l.key} x={l.pt.x + 8} y={l.labelY ?? l.pt.y} dy="0.32em" className="tc-end-label">
                    <tspan fill={l.color}>●</tspan> {l.text}
                  </text>
                ))}

                {hr && (
                  <g pointerEvents="none">
                    {hr.baseline != null && <circle cx={cx(hovered)} cy={y(hr.baseline)} r={4} fill={BASELINE_COLOR} className="tc-dot" />}
                    {hr.average != null && <circle cx={cx(hovered)} cy={y(hr.average)} r={4} fill={AVG_COLOR} className="tc-dot" />}
                  </g>
                )}

                {/* Invisible full-height hover targets, one per day. */}
                {rows.map((r, i) => (
                  <rect
                    key={r.date}
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

          {hr && (
            <div className="sc-tip" style={{ left: Math.max(tipLeft, 0), top: margin.top, width: tipW }}>
              <div className="sc-tip-period">{longDate(hr.day)}</div>
              <div className="sc-tip-total">{pounds(hr.variable)}</div>
              <div className="tc-tip-row">
                <span>
                  <span className="tc-key" style={{ background: AVG_COLOR }} />
                  {windowDays}-day average
                </span>
                <span>{hr.average == null ? "not enough days yet" : pounds(hr.average)}</span>
              </div>
              <div className="tc-tip-row">
                <span>
                  <span className="tc-key tc-key-dashed" style={{ borderColor: BASELINE_COLOR }} />
                  Expected
                </span>
                <span>{hr.baseline == null ? "not enough history" : pounds(hr.baseline)}</span>
              </div>
              {hr.unusual && (
                <div className="sc-tip-anoms">
                  <div className="sc-tip-anom-title">
                    <svg width="12" height="12" aria-hidden="true">
                      <AnomalyMarker x={6} y={6.5} shape={SEVERITY[severityRank(hr.classification)].shape} size={4.5} />
                    </svg>
                    {hr.classification}
                  </div>
                  <div className="sc-tip-anom-detail">
                    {pounds(hr.variable - (hr.baseline ?? 0))} more than expected · score {hr.score.toFixed(1)}
                  </div>
                </div>
              )}
              {hr.bills > 0 && (
                <div className="sc-tip-anom-detail tc-bills">
                  Plus {hr.bills} bill{hr.bills === 1 ? "" : "s"} · {pounds(hr.total)} in total
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
      </div>
    </div>
  );
}

const TREND_CSS = `
.spend-chart .tc-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; pointer-events: none; }
.spend-chart .tc-line-avg { stroke-width: 2.5; }
.spend-chart .tc-crosshair { stroke: var(--sc-axis); stroke-width: 1; }
.spend-chart .tc-dot { stroke: var(--sc-surface); stroke-width: 2; }
.spend-chart .tc-end-label { fill: var(--sc-ink-2); font-size: 12px; font-weight: 600; }
.spend-chart .tc-tip-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
.spend-chart .tc-tip-row > span:first-child { display: flex; align-items: center; color: var(--sc-ink-2); }
.spend-chart .tc-key { display: inline-block; width: 14px; height: 3px; border-radius: 2px; margin-right: 6px; }
.spend-chart .tc-key-dashed { height: 0; border-top: 2px dashed; background: none; border-radius: 0; }
.spend-chart .tc-bills { margin-top: 6px; }
`;
