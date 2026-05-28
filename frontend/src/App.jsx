import { useEffect, useState } from "react";
import { subHours, subDays, subMonths } from "date-fns";
import { supabase, isConfigured } from "./supabase.js";
import { OccupancyChart } from "./components/OccupancyChart.jsx";
import { HourlyAverages } from "./components/HourlyAverages.jsx";

// --- Demo data (used when Supabase is not yet configured) ---------------
function generateDemoData() {
  const rows = [];
  const now = Date.now();
  // Simulate 7 days of readings every 5 minutes
  for (let i = 7 * 24 * 60; i >= 0; i -= 5) {
    const ts = new Date(now - i * 60 * 1000);
    const hour = ts.getHours();
    // Pool is "closed" between midnight and 6am
    if (hour < 6 || hour >= 23) continue;
    // Bell-curve occupancy pattern peaking at noon and 6pm
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
  { label: "24 hours", key: "24h", from: () => subHours(new Date(), 24) },
  { label: "7 days",   key: "week", from: () => subDays(new Date(), 7) },
  { label: "30 days",  key: "month", from: () => subMonths(new Date(), 1) },
  { label: "All time", key: "all",  from: () => new Date(0) },
];

export default function App() {
  const [range, setRange] = useState("week");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      if (!isConfigured) {
        // Filter demo data to the selected range so tabs still work
        const from = RANGES.find((r) => r.key === range).from();
        setData(DEMO_DATA.filter((d) => new Date(d.recorded_at) >= from));
        setLoading(false);
        return;
      }

      const from = RANGES.find((r) => r.key === range).from();
      const { data: rows, error: err } = await supabase
        .from("occupancy")
        .select("recorded_at, people_count")
        .eq("pool_id", "hallenbad_city")
        .gte("recorded_at", from.toISOString())
        .order("recorded_at", { ascending: true })
        // Cap at 5000 rows so the chart stays fast
        .limit(5000);

      if (err) {
        setError(err.message);
      } else {
        setData(rows ?? []);
      }
      setLoading(false);
    }
    load();
  }, [range]);

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

      {/* Demo mode banner */}
      {!isConfigured && (
        <div className="demo-banner">
          Demo mode — connect Supabase to see real data (see README.md)
        </div>
      )}

      {/* Time range selector */}
      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`range-tab ${range === r.key ? "active" : ""}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Time series chart */}
      <section className="card">
        <h2 className="card-title">Occupancy over time</h2>
        {error ? (
          <div className="error">Failed to load data: {error}</div>
        ) : loading ? (
          <div className="chart-loading">Loading…</div>
        ) : (
          <OccupancyChart data={data} range={range} />
        )}
      </section>

      {/* Hourly averages (only meaningful with enough data) */}
      {!loading && data.length > 20 && <HourlyAverages data={data} />}
    </div>
  );
}

// Simple horizontal gauge bar
function Gauge({ value, max }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct < 40 ? "#22c55e" : pct < 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="gauge-track">
      <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
