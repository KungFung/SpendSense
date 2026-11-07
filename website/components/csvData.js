import { useEffect, useState } from "react";

// Loading and parsing the CSV files the charts use.
// Browsers can't read files from disk, so the CSVs must be served over HTTP next to the page.

export const DEFAULT_URLS = {
  statement: "/statement_withinfo.csv",
  anomalies: "/spending_anomalies.csv",
  dailyAnalysis: "/daily_spending_analysis.csv",
};

// ---------- CSV parsing ----------

// Parses CSV text into an array of objects keyed by the header row.
// Handles quoted fields containing commas, doubled quotes ("") and \r\n line endings.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((f) => f.trim() !== ""));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const num = (s) => (s == null || s.trim() === "" ? null : Number(s));
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Tidying NatWest descriptions ----------

// Nicer names for merchants whose statement text doesn't title-case well.
const MERCHANT_NAMES = {
  "AMAZON.CO.UK*2K4P1": "Amazon.co.uk",
  AMZNMKTPLACE: "Amazon Marketplace",
  "ASOS.COM": "ASOS.com",
  "EE LIMITED": "EE Limited",
  "GLASGOW CITY COUN": "Glasgow City Council",
  "GREGGS PLC": "Greggs",
  "JUST EAT.CO.UK LTD": "Just Eat",
  "LIDL GB GLASGOW": "Lidl Glasgow",
  "MCDONALDS 1182": "McDonald's",
  "NETFLIX.COM": "Netflix.com",
  "PUREGYM LTD": "PureGym",
  "SAINSBURYS S/MKTS": "Sainsbury's",
  SCOTRAIL: "ScotRail",
  "SPOTIFY UK": "Spotify UK",
  "STEAM PURCHASE": "Steam",
  "TFL TRAVEL CH": "TfL Travel",
  "TK MAXX 0221": "TK Maxx 0221",
  "UBER *EATS": "Uber Eats",
  "UBER *TRIP": "Uber",
  WHSMITH: "WHSmith",
};

const titleCase = (s) => s.replace(/[A-Za-z]+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
const merchantName = (raw) => MERCHANT_NAMES[raw.trim().toUpperCase()] ?? titleCase(raw.trim());

// Turns a NatWest description into a short readable name, e.g.
//   "'3167 03Nov26 C , DELIVEROO , GB"          -> "Deliveroo"
//   "'T BROWN , DINNER , VIA MOBILE - PYMT"     -> "Payment to T Brown"
//   "'LNK GLASGOW 29Aug @20:10" (type C/L)      -> "Cash withdrawal"
export function cleanDescription(raw, type) {
  const d = raw.replace(/^'/, "").trim();
  const parts = d.split(" , ");
  if (type === "C/L") return "Cash withdrawal";
  if (type === "DPC" || /VIA MOBILE/.test(d)) return `Payment to ${titleCase(parts[0])}`;
  if (type === "POS" || (type == null && parts.length >= 3)) return merchantName(parts[1] ?? d);
  return merchantName(d);
}

// ---------- One parser per file ----------

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

// "05 Nov 2026 06:00" -> "2026-11-05T06:00"
function natwestDate(s) {
  const m = s.trim().match(/^(\d{1,2}) (\w{3}) (\d{4})(?: (\d{1,2}):(\d{2}))?$/);
  if (!m) throw new Error(`Unrecognised date: "${s}"`);
  const [, d, mon, y, hh = "0", mm = "00"] = m;
  return `${y}-${pad(MONTHS[mon])}-${pad(d)}T${pad(hh)}:${mm}`;
}

// statement_withinfo.csv -> purchases (money going out only), oldest first.
// NatWest exports are newest first, so reverse before sorting to keep same-minute payments in order.
export function parseStatement(text) {
  return parseCsv(text)
    .reverse()
    .filter((r) => num(r.Value) < 0)
    .map((r) => ({
      date: natwestDate(r.Date),
      type: r.Type,
      description: cleanDescription(r.Description, r.Type),
      amount: round2(-num(r.Value)),
      flagged: r.Flagged === "Yes",
      preApproved: r["Pre-approved"] === "Yes",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// spending_anomalies.csv -> unusual days.
export function parseAnomalies(text) {
  return parseCsv(text).map((r) => ({
    date: r.Date,
    classification: r.Classification,
    actual: num(r.Actual_Spending),
    expected: num(r.Expected_Spending),
    difference: num(r.Difference),
    score: num(r.Anomaly_Score),
    largestTransaction: cleanDescription(r.Largest_Transaction),
  }));
}

// daily_spending_analysis.csv -> one row per day.
export function parseDailyAnalysis(text) {
  return parseCsv(text)
    .map((r) => ({
      date: r.Date,
      total: round2(num(r.Total_Spending)),
      variable: round2(num(r.Variable_Spending)),
      bills: num(r.Fixed_Expenses) ?? 0,
      baseline: num(r.Baseline),
      score: num(r.Anomaly_Score),
      classification: r.Classification,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- React hook ----------

// Fetches a CSV and parses it. Pass url = null to skip fetching (e.g. when data came in as a prop).
// Returns { data, error, loading }.
export function useCsv(url, parse) {
  const [state, setState] = useState({ data: null, error: null, loading: url != null });

  useEffect(() => {
    if (url == null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => !cancelled && setState({ data: parse(text), error: null, loading: false }))
      .catch((error) => !cancelled && setState({ data: null, error, loading: false }));
    return () => {
      cancelled = true;
    };
  }, [url, parse]);

  return state;
}
