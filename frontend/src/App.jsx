import { useEffect, useState } from "react";
import { subHours, subDays, subMonths, startOfDay, endOfDay } from "date-fns";
import { supabase, isConfigured } from "./supabase.js";
import { OccupancyChart } from "./components/OccupancyChart.jsx";
import { HourlyAverages } from "./components/HourlyAverages.jsx";
import { DateRangePicker } from "./components/DateRangePicker.jsx";

// --- Demo data (used when Supabase is not yet configured) ---------------
function generateDemoData() {
  const rows = [];
  const now = Date.now();
  for (let i = 7 * 24 * 60; i >= 0; i -= 5) {
    const ts = new Date(now - i * 60 * 1000);
    const hour = ts.getHours();
    if (hour < 6 || hour >= 23) continue;
    const base = 80 + 100 * Math.exp(-0.04 * (hour - 12) ** 2)
                    + 60 * Math.exp(-0.1 * (hour - 18) ** 2);
    const noise = (Math.random() - 0.5) * 30;
    rows.push({ recorded_at: ts.toISOString(), people_count: Math.max(0, Math.round(base + noise)) });
  }
  return rows;
}
const DEMO_DATA = generateDemoData();
// ------------------------------------------------------------------------

const RANGES = [
  { label: "24 hours", key: "24h",   from: () => subHours(new Date(), 24) },
  { label: "7 days",   key: "week",  from: () => subDays(new Date(), 7) },
  { label: "30 days",  key: "month", from: () => subMonths(new Date(), 1) },
  { label: "All time", key: "all",   from: () => new Date(0) },
];

const BUCKET_MS = {
  "24h":   5  * 60 * 1000,
  "week":  60 * 60 * 1000,
  "month": 6  * 60 * 60 * 1000,
  "all":   24 * 60 * 60 * 1000,
};

// Pick a sensible bucket size for an arbitrary date range
function autoBucketMs(from, to) {
  const days = (to - from) / 86_400_000;
  if (days <= 2)  return 5  * 60 * 1000;
  if (days <= 14) return 60 * 60 * 1000;
  if (days <= 60) return 6  * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function aggregateForChart(data, bucketMs) {
  const buckets = new Map();
  for (const d of data) {
    if (d.people_count == null) continue;
    const ts = new Date(d.recorded_at).getTime();
    const bucket = Math.floor(ts / bucketMs) * bucketMs;
    if (!buckets.has(bucket)) buckets.set(bucket, { sum: 0, n: 0 });
    const b = buckets.get(bucket);
    b.sum += d.people_count;
    b.n++;
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ts, { sum, n }]) => ({ ts, people_count: Math.round(sum / n) }));
}

// Compute hour-of-day averages from demo data (used when Supabase is not configured)
function demoHourlyAverages() {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, sum: 0, n: 0 }));
  for (const d of DEMO_DATA) {
    if (d.people_count == null) continue;
    buckets[new Date(d.recorded_at).getHours()].sum += d.people_count;
    buckets[new Date(d.recorded_at).getHours()].n += 1;
  }
  return buckets
    .filter((b) => b.n > 0)
    .map((b) => ({ hour: b.hour, avg_people: Math.round(b.sum / b.n) }));
}

export default function App() {
  const [range, setRange] = useState("week");
  const [customRange, setCustomRange] = useState(null); // { from: Date, to: Date } or null
  const [data, setData] = useState([]);
  const [hourlyAvgs, setHourlyAvgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Clicking a preset tab clears any custom range
  function selectRange(key) {
    setCustomRange(null);
    setRange(key);
  }

  const activeFrom = customRange?.from ?? RANGES.find((r) => r.key === range).from();
  const activeTo   = customRange?.to   ?? new Date();

  // Bucket size for the current view
  const bucketMs = customRange
    ? autoBucketMs(activeFrom, activeTo)
    : BUCKET_MS[range];

  // Recharts range key hint for axis formatting (derived from bucket size)
  const chartRange = bucketMs <= 5 * 60 * 1000   ? "24h"
                   : bucketMs <= 60 * 60 * 1000   ? "week"
                   : bucketMs <= 6 * 60 * 60 * 1000 ? "month"
                   : "all";

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      if (!isConfigured) {
        const filtered = DEMO_DATA.filter((d) => {
          const t = new Date(d.recorded_at);
          return t >= activeFrom && t <= activeTo;
        });
        setData(filtered);
        setLoading(false);
        return;
      }

      // Use a server-side aggregation function so we never hit Supabase's
      // 1000-row per-request limit. The DB returns pre-bucketed averages
      // (≤ ~300 rows), which the chart plots directly as { ts, people_count }.
      const { data: rows, error: err } = await supabase.rpc(
        "get_occupancy_bucketed",
        {
          p_pool_id:     "hallenbad_city",
          p_from:        activeFrom.toISOString(),
          p_to:          activeTo.toISOString(),
          p_bucket_secs: Math.round(bucketMs / 1000),
        }
      );

      if (err) {
        setError(err.message);
      } else {
        // RPC returns { bucket, people_count }; map to { recorded_at, people_count }
        // so demo mode and real mode share the same shape going into aggregateForChart.
        setData((rows ?? []).map((r) => ({ recorded_at: r.bucket, people_count: r.people_count })));
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customRange]);

  // Separate fetch for the "average by hour of day" chart.
  // Runs whenever the time window changes so it reflects the selected period.
  useEffect(() => {
    async function loadHourly() {
      if (!isConfigured) {
        setHourlyAvgs(demoHourlyAverages());
        return;
      }
      const { data: rows } = await supabase.rpc("get_hourly_averages", {
        p_pool_id: "hallenbad_city",
        p_from: activeFrom.toISOString(),
        p_to: activeTo.toISOString(),
      });
      setHourlyAvgs(rows ?? []);
    }
    loadHourly();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customRange]);

  const latest = data.at(-1);
  const current = latest?.people_count;

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">🏊 Hallenbad City</h1>
        <p className="subtitle">Live occupancy tracker · Zürich</p>
      </header>

      {/* Current count */}
      <section className="card current-card">
        {loading ? (
          <div className="spinner" />
        ) : current != null ? (
          <>
            <div className="current-count">{current}</div>
            <div className="current-label">people in the pool right now</div>
            <Gauge value={current} max={350} />
          </>
        ) : (
          <div className="current-label">Pool is currently closed</div>
        )}
        {latest && (
          <div className="updated-at">
            Last updated:{" "}
            {new Date(latest.recorded_at).toLocaleTimeString("en-CH", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </section>

      {!isConfigured && (
        <div className="demo-banner">
          Demo mode — connect Supabase to see real data (see README.md)
        </div>
      )}

      {/* Range selector: preset tabs + custom date picker */}
      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`range-tab ${!customRange && range === r.key ? "active" : ""}`}
            onClick={() => selectRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        <DateRangePicker
          value={customRange}
          onChange={setCustomRange}
          onClear={() => setCustomRange(null)}
        />
      </div>

      {/* Time series chart */}
      <section className="card">
        <h2 className="card-title">Occupancy over time</h2>
        {error ? (
          <div className="error">Failed to load data: {error}</div>
        ) : loading ? (
          <div className="chart-loading">Loading…</div>
        ) : (
          <OccupancyChart data={aggregateForChart(data, bucketMs)} range={chartRange} />
        )}
      </section>

      {hourlyAvgs.length > 0 && <HourlyAverages data={hourlyAvgs} />}
    </div>
  );
}

function Gauge({ value, max }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct < 40 ? "#22c55e" : pct < 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="gauge-track">
      <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
