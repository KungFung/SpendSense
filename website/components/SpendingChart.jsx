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
import { DEFAULT_STATEMENT_URL, readStatementFile, useStatement } from "./csvData.js";

// One chart of spending over time, read from the bank statement, styled like Offbeat.html:
// - bars: how much was spent in each day / week / month, split into flagged, pre-approved and other purchases
// - a pale band behind each bar: the usual range of day-to-day spending from the anomaly detection.
//   A bar above its band is exactly an unusual day.
// - a moving average of day-to-day spending (dark line)
// - amber markers under days the anomaly detection marked as unusual
// Bills (direct debits and standing orders) are hidden by default so a £650 rent payment doesn't
// squash everything else; when hidden, the bars, band and line all measure the same thing.

const SCALES = [
  { id: "day", label: "Day", lines: true, avgWindow: 7, avgLabel: "7-day average" },
  { id: "week", label: "Week", lines: true, avgWindow: 4, avgLabel: "4-week average" },
  // Only a few months, two of them partial, so the band and average would mislead: just bars.
  { id: "month", label: "Month", lines: false, avgWindow: null, avgLabel: null },
];

// Bar segments, bottom to top, in Offbeat's colours. Bills count as pre-approved.
const SEGMENTS = [
  { key: "other", label: "Other spending", color: "var(--bar)" },
  { key: "preApproved", label: "Pre-approved", color: "var(--accent)" },
  { key: "flagged", label: "Flagged", color: "var(--alert)" },
];

const BILL_TYPES = new Set(["D/D", "S/O"]);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parseLocal = (s) => new Date(s.length === 10 ? `${s}T00:00` : s); // local time, not UTC
const segmentOf = (p) => (p.flagged ? "flagged" : p.preApproved ? "preApproved" : "other");
const sumOf = (xs, f) => xs.reduce((s, x) => s + f(x), 0);

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

function periodLabel(d, scale) {
  const dm = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (scale === "day") return `${WEEKDAYS[d.getDay()]} ${dm}`;
  if (scale === "week") {
    const end = new Date(d.getTime() + 6 * DAY_MS);
    return `${dm} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Groups everything into periods. Periods with no spending are kept so time stays evenly spaced.
function buildBuckets({ purchases, days, anomalies }, scale, includeBills, { lines, avgWindow }) {
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
      dayToDay: 0, // spending excluding bills: what the band and line measure
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

  const buckets = [...byKey.values()].map((b) => {
    // Usual range and expected spending for the period: the sum over its days,
    // or nothing if any day in it didn't have enough history yet.
    const known = lines && b.days.length > 0 && b.days.every((d) => d.baseline != null);
    return {
      ...b,
      total: b.other + b.preApproved + b.flagged,
      expected: known ? sumOf(b.days, (d) => d.baseline) : null,
      usualLow: known ? sumOf(b.days, (d) => d.usualLow) : null,
      usualHigh: known ? sumOf(b.days, (d) => d.usualHigh) : null,
      anomalies: b.anomalies.sort((x, y) => severityRank(x.classification) - severityRank(y.classification) || y.score - x.score),
    };
  });

  // Moving average of day-to-day spending over the last `avgWindow` periods (including this one).
  buckets.forEach((b, i) => {
    b.average = lines && avgWindow && i >= avgWindow - 1 ? sumOf(buckets.slice(i - avgWindow + 1, i + 1), (x) => x.dayToDay) / avgWindow : null;
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
// The user can also upload their own statement CSV; it's read in the browser and never sent anywhere.
export default function SpendingChart({ data, statementUrl = DEFAULT_STATEMENT_URL, initialScale = "day" }) {
  const [upload, setUpload] = useState(null); // { name, data, id } once the user has uploaded a file
  const [uploadError, setUploadError] = useState(null);
  const loaded = useStatement(data ? null : statementUrl);

  const onFile = async (file) => {
    setUploadError(null);
    try {
      const analysed = await readStatementFile(file);
      setUpload({ name: file.name, data: analysed, id: Date.now() });
    } catch (e) {
      setUploadError(e.message || String(e));
    }
  };
  const uploadControls = { fileName: upload?.name, error: uploadError, onFile, onReset: () => {
      setUpload(null);
      setUploadError(null);
    },
  };

  const d = upload?.data ?? data ?? loaded.data;
  if (!d) {
    return (
      <ChartMessage title="Spending" error={loaded.error}>
        {loaded.error && (
          <div className="sc-foot">
            <UploadButton {...uploadControls} />
          </div>
        )}
      </ChartMessage>
    );
  }
  // A new key for each upload resets the view (scale, hover, scroll) for the new data.
  return <SpendingChartView key={upload?.id ?? "default"} data={d} initialScale={initialScale} upload={uploadControls} />;
}

// "Upload CSV" button, with the uploaded file's name (and a way back to the sample data) or an error.
function UploadButton({ fileName, error, onFile, onReset }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="sc-foot-right">
      {error && <span className="sc-upload-error" role="alert">Couldn't use that file: {error}.</span>}
      {!error && fileName && (
        <span className="sc-source">
          Showing <b>{fileName}</b>{" "}
          <button className="sc-linkbtn" onClick={onReset}>
            Use sample data
          </button>
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so picking the same file again still triggers a change
          if (!file) return;
          setBusy(true);
          await onFile(file);
          setBusy(false);
        }}
      />
      <button className="sc-btn solid" disabled={busy} onClick={() => inputRef.current?.click()} title="NatWest-style CSV: Date, Type, Description, Value (Flagged and Pre-approved columns optional)">
        {busy ? "Reading…" : "Upload CSV"}
      </button>
    </div>
  );
}

function SpendingChartView({ data, initialScale, upload }) {
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
  const buckets = useMemo(() => buildBuckets(data, scale, includeBills, scaleInfo), [data, scale, includeBills, scaleInfo]);

  const dayToDayTotal = sumOf(data.purchases.filter((p) => !BILL_TYPES.has(p.type)), (p) => p.amount);
  const billsTotal = sumOf(data.purchases.filter((p) => BILL_TYPES.has(p.type)), (p) => p.amount);
  const presentSegments = SEGMENTS.filter((s) => buckets.some((b) => b[s.key] > 0));
  const presentSeverities = SEVERITY.filter((sev) => data.anomalies.some((a) => a.classification === sev.classification));
  const hasAverage = buckets.some((b) => b.average != null);
  const hasBand = buckets.some((b) => b.usualHigh != null);

  // Layout. If there are too many bars to fit, the chart gets wider and scrolls sideways.
  const laneH = showUnusual ? 16 : 0; // strip under the bars for unusual-day markers
  const margin = { top: 10, right: 70, bottom: 32 + laneH, left: 44 };
  const height = 300;
  const minSlot = 5;
  const plotW = Math.max(wrapWidth - margin.left - margin.right, buckets.length * minSlot);
  const plotH = height - margin.top - margin.bottom;
  const width = plotW + margin.left + margin.right;
  const slot = plotW / Math.max(buckets.length, 1);
  // Like Offbeat: the band is a little narrower than the slot, the bar narrower again.
  const bandInset = Math.min(3, slot * 0.12);
  const barInset = Math.min(slot * 0.3, Math.max(slot * 0.18, 6) + (slot > 60 ? slot * 0.12 : 0));
  const barW = Math.max(1, slot - 2 * barInset);

  const maxVal = Math.max(0, ...buckets.map((b) => Math.max(b.total, b.average ?? 0, b.usualHigh ?? 0)));
  const ticks = niceTicks(maxVal, 2);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (v) => margin.top + plotH - (v / yMax) * plotH;
  const x0 = (i) => margin.left + i * slot;
  const cx = (i) => x0(i) + slot / 2;
  const baseY = y(0);

  const avgPoints = buckets.map((b, i) => (b.average == null ? null : { x: cx(i), y: y(b.average) }));
  const avgEnd = [...avgPoints].reverse().find(Boolean);

  // X labels: day of month (or month name), with the month written underneath where it changes.
  // About one label per 44px; in Day view they land on Mondays.
  const every = scale === "day" ? Math.max(7, Math.ceil(44 / slot / 7) * 7) : Math.max(1, Math.ceil(44 / slot));
  const firstLabel = scale === "day" ? Math.max(0, buckets.findIndex((b) => b.start.getDay() === 1)) : 0;
  let lastMonth = null;
  const labels = buckets.map((b, i) => {
    if (i < firstLabel || (i - firstLabel) % every !== 0) return null;
    if (scale === "month") return { top: MONTHS[b.start.getMonth()] };
    const month = b.start.getMonth();
    const showMonth = month !== lastMonth;
    lastMonth = month;
    return { top: String(b.start.getDate()), bottom: showMonth ? MONTHS[month] : null };
  });

  const hb = hovered != null ? buckets[hovered] : null;
  const tipW = 250;
  const visibleCentre = hb ? cx(hovered) - scrollX : 0; // the tooltip sits outside the scroll area
  const tipLeft = visibleCentre + slot / 2 + tipW + 8 <= wrapWidth ? visibleCentre + slot / 2 + 8 : visibleCentre - slot / 2 - tipW - 8;

  const pickScale = (id) => {
    setScale(id);
    setHovered(null);
    setScrollX(0);
  };

  return (
    <section className="spend-chart">
      <style>{CHART_CSS}</style>

      <div className="sc-head">
        <h2 className="sc-title">Spending</h2>
        <span className="sc-hint">{showTable ? "Every period, as numbers" : "Hover a bar to inspect it"}</span>
      </div>

      <div className="sc-stats">
        <div className="sc-stat">
          <span>Day-to-day</span>
          <b>{poundsShort(dayToDayTotal)}</b>
        </div>
        <div className="sc-stat">
          <span>Bills</span>
          <b>{poundsShort(billsTotal)}</b>
        </div>
        <div className="sc-stat">
          <span>Unusual days</span>
          <b>{data.anomalies.length}</b>
        </div>
      </div>

      <div className="sc-controls">
        <div className="sc-scale" role="radiogroup" aria-label="Time scale">
          {SCALES.map((s) => (
            <button key={s.id} role="radio" aria-checked={scale === s.id} className={scale === s.id ? "on" : ""} onClick={() => pickScale(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="sc-toggles">
          <label className="sc-toggle">
            <input type="checkbox" checked={includeBills} onChange={(e) => setIncludeBills(e.target.checked)} />
            Include bills
          </label>
          <label className="sc-toggle">
            <input type="checkbox" checked={showUnusual} onChange={(e) => setShowUnusual(e.target.checked)} />
            Mark unusual days
          </label>
        </div>
      </div>

      {showTable ? (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th scope="col">{scaleInfo.label}</th>
                <th scope="col" className="num">Spent</th>
                <th scope="col" className="num">Flagged</th>
                <th scope="col" className="num">Pre-approved</th>
                {hasBand && <th scope="col" className="num">Usual range</th>}
                {hasAverage && <th scope="col" className="num">Average</th>}
                {showUnusual && <th scope="col">Unusual</th>}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.start.getTime()}>
                  <td>{periodLabel(b.start, scale)}</td>
                  <td className="num">{pounds(b.total)}</td>
                  <td className="num">{b.flagged ? pounds(b.flagged) : "–"}</td>
                  <td className="num">{b.preApproved ? pounds(b.preApproved) : "–"}</td>
                  {hasBand && <td className="num">{b.usualHigh == null ? "–" : `${poundsShort(b.usualLow)}–${poundsShort(b.usualHigh)}`}</td>}
                  {hasAverage && <td className="num">{b.average == null ? "–" : pounds(b.average)}</td>}
                  {showUnusual && (
                    <td className={b.anomalies.length ? "" : "sc-muted"}>
                      {b.anomalies.length === 0
                        ? "–"
                        : b.anomalies.length === 1
                          ? b.anomalies[0].classification
                          : `${b.anomalies.length} days, worst: ${b.anomalies[0].classification.toLowerCase()}`}
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
                aria-label={`Spending per ${scale} against the usual range. Use "Show as table" for the numbers.`}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Weekend shading (Day view only), like Offbeat */}
                {scale === "day" &&
                  buckets.map((b, i) =>
                    b.start.getDay() % 6 === 0 ? <rect key={`w${i}`} className="sc-wkend" x={x0(i)} y={margin.top} width={slot} height={plotH} /> : null
                  )}

                {ticks.map((t) => (
                  <g key={t}>
                    <path className="sc-gridline" d={`M${margin.left} ${y(t)}H${margin.left + plotW}`} />
                    <text x={margin.left - 6} y={y(t) + 3} textAnchor="end">
                      {poundsShort(t)}
                    </text>
                  </g>
                ))}

                {buckets.map((b, i) => {
                  const bx = x0(i) + barInset;
                  // Stack the segments with a small gap between them; only the top one gets rounded corners.
                  const shown = SEGMENTS.filter((s) => b[s.key] > 0);
                  const segGap = barW >= 6 ? 1.5 : 1;
                  let base = b.total;
                  const sev = b.anomalies.length ? SEVERITY[severityRank(b.anomalies[0].classification)] : null;
                  const label = labels[i];
                  return (
                    <g key={b.start.getTime()}>
                      {b.usualHigh != null && (
                        <rect
                          className="sc-band"
                          x={x0(i) + bandInset}
                          y={y(b.usualHigh)}
                          width={Math.max(1, slot - 2 * bandInset)}
                          height={Math.max(2, y(b.usualLow) - y(b.usualHigh))}
                          rx={Math.min(3, slot / 4)}
                        />
                      )}
                      {[...shown].reverse().map((s, k) => {
                        const top = y(base);
                        base -= b[s.key];
                        const h = Math.max(k === shown.length - 1 ? 2 : 0, y(base) - top - (k < shown.length - 1 ? segGap : 0));
                        if (h <= 0.3) return null;
                        return k === 0 ? (
                          <path key={s.key} d={barPath(bx, top, barW, h)} style={{ fill: s.color }} />
                        ) : (
                          <rect key={s.key} x={bx} y={top} width={barW} height={h} style={{ fill: s.color }} />
                        );
                      })}
                      {showUnusual && sev && (
                        <g>
                          <AnomalyMarker
                            x={cx(i) - (b.anomalies.length > 1 ? 5 : 0)}
                            y={baseY + laneH / 2 + 2}
                            shape={sev.shape}
                            size={Math.min(4.5, slot / 2 + 1)}
                          />
                          {b.anomalies.length > 1 && (
                            <text className="sc-mark-count" x={cx(i) + 1} y={baseY + laneH / 2 + 5.5}>
                              {b.anomalies.length}
                            </text>
                          )}
                        </g>
                      )}
                      {label && (
                        <>
                          <text className={hovered === i ? "strong" : ""} x={cx(i)} y={height - 18} textAnchor="middle">
                            {label.top}
                          </text>
                          {label.bottom && (
                            <text className="strong" x={cx(i)} y={height - 5} textAnchor="middle">
                              {label.bottom}
                            </text>
                          )}
                        </>
                      )}
                    </g>
                  );
                })}

                <path d={linePath(avgPoints)} className="sc-avg-halo" />
                <path d={linePath(avgPoints)} className="sc-avg" />
                {avgEnd && (
                  <text className="sc-end-label" x={avgEnd.x + 8} y={avgEnd.y + 3.5}>
                    Average
                  </text>
                )}

                {hb && (
                  <>
                    <rect className="sc-sel" x={x0(hovered) + 0.5} y={margin.top} width={Math.max(1, slot - 1)} height={plotH} rx={4} />
                    {hb.average != null && <circle className="sc-dot" cx={cx(hovered)} cy={y(hb.average)} r={3.5} />}
                  </>
                )}

                {/* Invisible full-height hover targets, so thin bars are easy to hover. */}
                {buckets.map((b, i) => (
                  <rect
                    key={b.start.getTime()}
                    x={x0(i)}
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

          {hb && (
            <Tooltip
              b={hb}
              scale={scale}
              scaleInfo={scaleInfo}
              includeBills={includeBills}
              showUnusual={showUnusual}
              left={Math.max(tipLeft, 0)}
              top={margin.top}
              width={tipW}
            />
          )}
        </div>
      )}

      <ul className="sc-legend">
        {presentSegments.map((s) => (
          <li key={s.key}>
            <i className="sc-key" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        {hasBand && (
          <li>
            <i className="sc-key" style={{ background: "var(--band)" }} />
            Usual range
          </li>
        )}
        {hasAverage && (
          <li>
            <i className="sc-key sc-key-line" />
            {scaleInfo.avgLabel}
          </li>
        )}
        {showUnusual &&
          presentSeverities.map((sev) => (
            <li key={sev.classification}>
              <svg width="12" height="12" aria-hidden="true">
                <AnomalyMarker x={6} y={6.5} shape={sev.shape} size={4.5} />
              </svg>
              {sev.label}
            </li>
          ))}
      </ul>

      <div className="sc-foot">
        <button className="sc-btn" onClick={() => setShowTable((v) => !v)}>
          {showTable ? "Show as chart" : "Show as table"}
        </button>
        <UploadButton {...upload} />
      </div>
    </section>
  );
}

function Tooltip({ b, scale, scaleInfo, includeBills, showUnusual, left, top, width }) {
  const notable = b.items.filter((p) => p.flagged || p.preApproved);
  const segments = [...SEGMENTS].reverse().filter((s) => b[s.key] > 0);
  return (
    <div className="sc-tip" style={{ left, top, width }}>
      <div>
        <div className="sc-tip-date">{periodLabel(b.start, scale)}</div>
        <div className="sc-tip-total">{pounds(b.total)}</div>
      </div>

      {(segments.length > 1 || (!includeBills && b.bills > 0)) && (
        <div className="sc-tip-section">
          {segments.length > 1 &&
            segments.map((s) => (
              <div key={s.key} className="sc-row">
                <span>
                  <i className="sc-key" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span>{pounds(b[s.key])}</span>
              </div>
            ))}
          {!includeBills && b.bills > 0 && <div className="sc-note">Plus {pounds(b.bills)} on bills, hidden</div>}
        </div>
      )}

      {(b.usualHigh != null || b.average != null) && (
        <div className="sc-tip-section">
          {b.usualHigh != null && (
            <div className="sc-row">
              <span>
                <i className="sc-key" style={{ background: "var(--band)" }} />
                Usual range
              </span>
              <span>
                {poundsShort(b.usualLow)} to {poundsShort(b.usualHigh)}
              </span>
            </div>
          )}
          {b.expected != null && (
            <div className="sc-row">
              <span>Expected</span>
              <span>{pounds(b.expected)}</span>
            </div>
          )}
          {b.average != null && (
            <div className="sc-row">
              <span>
                <i className="sc-key sc-key-line" />
                {scaleInfo.avgLabel}
              </span>
              <span>{pounds(b.average)}</span>
            </div>
          )}
        </div>
      )}

      {notable.length > 0 && (
        <div className="sc-tip-section">
          {notable.slice(0, 4).map((p, k) => (
            <div key={k} className="sc-row">
              <span>
                <b className={`sc-chip ${p.flagged ? "alert" : "accent"}`}>{p.flagged ? "Flagged" : "Pre-approved"}</b>
                {p.description}
              </span>
              <span>{pounds(p.amount)}</span>
            </div>
          ))}
          {notable.length > 4 && <div className="sc-note">+ {notable.length - 4} more</div>}
        </div>
      )}

      {showUnusual && b.anomalies.length > 0 && (
        <div className="sc-tip-section">
          {b.anomalies.slice(0, 2).map((a) => (
            <div key={a.date}>
              <span className="sc-pill">
                <svg width="10" height="10" aria-hidden="true">
                  <AnomalyMarker x={5} y={5.5} shape={SEVERITY[severityRank(a.classification)].shape} size={4} />
                </svg>
                {a.classification}
              </span>
              <div className="sc-note">
                {scale !== "day" && <b>{periodLabel(parseLocal(a.date), "day")}: </b>}
                {pounds(a.actual)} spent, {pounds(a.expected)} expected. Biggest: {a.largestTransaction}
              </div>
            </div>
          ))}
          {b.anomalies.length > 2 && <div className="sc-note">+ {b.anomalies.length - 2} more unusual days</div>}
        </div>
      )}
    </div>
  );
}
