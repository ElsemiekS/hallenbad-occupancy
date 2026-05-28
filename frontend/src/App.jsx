import { useEffect, useState } from "react";
import { subHours, subDays, subMonths } from "date-fns";
import { supabase, isConfigured } from "./supabase.js";
import { POOL_LIST, POOL_BY_ID } from "./pools.js";
import { PoolSelector } from "./components/PoolSelector.jsx";
import { OccupancyChart } from "./components/OccupancyChart.jsx";
import { HourlyAverages } from "./components/HourlyAverages.jsx";
import { ForecastChart } from "./components/ForecastChart.jsx";
import { DateRangePicker } from "./components/DateRangePicker.jsx";

// ── Demo data ─────────────────────────────────────────────────────────────────
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

function demoHourlyAverages() {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, sum: 0, n: 0 }));
  for (const d of DEMO_DATA) {
    if (d.people_count == null) continue;
    buckets[new Date(d.recorded_at).getHours()].sum += d.people_count;
    buckets[new Date(d.recorded_at).getHours()].n += 1;
  }
  return buckets.filter((b) => b.n > 0).map((b) => ({ hour: b.hour, avg_people: Math.round(b.sum / b.n) }));
}

// ── Range config ──────────────────────────────────────────────────────────────
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

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedPools, setSelectedPools] = useState(["hallenbad_city"]);
  const [range, setRange] = useState("week");
  const [customRange, setCustomRange] = useState(null);

  // Pool-keyed data maps
  const [chartData,    setChartData]    = useState({}); // { poolId: [{ts,people_count}] }
  const [hourlyData,   setHourlyData]   = useState({}); // { poolId: [{hour,avg_people}] }
  const [forecastData, setForecastData] = useState({}); // { poolId: [{forecast_at,people_count_pred,model_name}] }
  const [liveReadings, setLiveReadings] = useState({}); // { poolId: {people_count,recorded_at} | null }
  const [dailyWeather, setDailyWeather] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  function selectRange(key) { setCustomRange(null); setRange(key); }

  const activeFrom = customRange?.from ?? RANGES.find((r) => r.key === range).from();
  const activeTo   = customRange?.to   ?? new Date();
  const bucketMs   = customRange ? autoBucketMs(activeFrom, activeTo) : BUCKET_MS[range];
  const chartRange = bucketMs <= 5 * 60 * 1000      ? "24h"
                   : bucketMs <= 60 * 60 * 1000     ? "week"
                   : bucketMs <= 6 * 60 * 60 * 1000 ? "month" : "all";

  // ── time-series chart data ────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      if (!isConfigured) {
        const filtered = DEMO_DATA.filter((d) => {
          const t = new Date(d.recorded_at);
          return t >= activeFrom && t <= activeTo;
        });
        setChartData({ hallenbad_city: aggregateForChart(filtered, bucketMs) });
        setLoading(false);
        return;
      }

      const results = await Promise.all(
        selectedPools.map((poolId) =>
          supabase.rpc("get_occupancy_bucketed", {
            p_pool_id: poolId,
            p_from: activeFrom.toISOString(),
            p_to: activeTo.toISOString(),
            p_bucket_secs: Math.round(bucketMs / 1000),
          }).then(({ data: rows, error: err }) => ({ poolId, rows, err }))
        )
      );

      const newData = {};
      for (const { poolId, rows, err } of results) {
        if (err) { setError(err.message); continue; }
        newData[poolId] = (rows ?? []).map((r) => ({ ts: new Date(r.bucket).getTime(), people_count: r.people_count }));
      }
      setChartData(newData);
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customRange, selectedPools.join(",")]);

  // ── hourly averages ───────────────────────────────────────────────────────
  useEffect(() => {
    async function loadHourly() {
      if (!isConfigured) {
        setHourlyData({ hallenbad_city: demoHourlyAverages() });
        return;
      }
      const results = await Promise.all(
        selectedPools.map((poolId) =>
          supabase.rpc("get_hourly_averages", {
            p_pool_id: poolId,
            p_from: activeFrom.toISOString(),
            p_to: activeTo.toISOString(),
          }).then(({ data: rows }) => ({ poolId, rows }))
        )
      );
      const newData = {};
      for (const { poolId, rows } of results) newData[poolId] = rows ?? [];
      setHourlyData(newData);
    }
    loadHourly();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customRange, selectedPools.join(",")]);

  // ── live readings (once on mount + when selected pools change) ────────────
  useEffect(() => {
    if (!isConfigured) {
      const last = DEMO_DATA.at(-1);
      setLiveReadings({ hallenbad_city: last ?? null });
      return;
    }
    Promise.all(
      selectedPools.map((poolId) =>
        supabase
          .from("occupancy")
          .select("people_count, recorded_at")
          .eq("pool_id", poolId)
          .not("people_count", "is", null)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .then(({ data: rows }) => ({ poolId, reading: rows?.[0] ?? null }))
      )
    ).then((results) => {
      const newData = {};
      for (const { poolId, reading } of results) newData[poolId] = reading;
      setLiveReadings(newData);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPools.join(",")]);

  // ── forecast (once on mount + when selected pools change) ─────────────────
  useEffect(() => {
    if (!isConfigured) return;
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    Promise.all(
      selectedPools.map((poolId) =>
        supabase
          .from("predictions")
          .select("forecast_at, people_count_pred, model_name")
          .eq("pool_id", poolId)
          .gte("forecast_at", now.toISOString())
          .lte("forecast_at", in7Days.toISOString())
          .order("forecast_at", { ascending: true })
          .then(({ data: rows }) => ({ poolId, rows: rows ?? [] }))
      )
    ).then((results) => {
      const newData = {};
      for (const { poolId, rows } of results) newData[poolId] = rows;
      setForecastData(newData);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPools.join(",")]);

  // ── daily weather for forecast strip ─────────────────────────────────────
  useEffect(() => {
    fetch(
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=47.3769&longitude=8.5417" +
      "&daily=temperature_2m_max,precipitation_sum" +
      "&timezone=Europe%2FZurich&forecast_days=8"
    )
      .then((r) => r.json())
      .then((data) => {
        const days = data.daily.time.map((date, i) => ({
          date,
          maxTemp: Math.round(data.daily.temperature_2m_max[i]),
          precip: data.daily.precipitation_sum[i] ?? 0,
        }));
        setDailyWeather(days.slice(0, 7));
      })
      .catch(() => {});
  }, []);

  // ── derived series for charts ─────────────────────────────────────────────
  const chartSeries   = selectedPools.map((id) => ({ pool: POOL_BY_ID[id], data: chartData[id]   ?? [] }));
  const hourlySeries  = selectedPools.map((id) => ({ pool: POOL_BY_ID[id], data: hourlyData[id]  ?? [] }));
  const forecastSeries= selectedPools.map((id) => ({ pool: POOL_BY_ID[id], data: forecastData[id]?? [] }));

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">🏊 Zürich Bäder</h1>
        <p className="subtitle">Live occupancy tracker · Zürich</p>
      </header>

      {/* Pool selector */}
      <PoolSelector selectedPools={selectedPools} onChange={setSelectedPools} />

      {/* Live count cards — one per selected pool */}
      <div className="live-cards">
        {selectedPools.map((poolId) => {
          const pool = POOL_BY_ID[poolId];
          const reading = liveReadings[poolId];
          const isRecent = reading && Date.now() - new Date(reading.recorded_at).getTime() < THREE_HOURS_MS;
          const count = isRecent ? reading.people_count : null;
          return (
            <section key={poolId} className="card live-card" style={{ "--pool-color": pool.color }}>
              <div className="live-card-header">
                <span className="live-card-dot" style={{ background: pool.color }} />
                <span className="live-card-name">{pool.short}</span>
              </div>
              {reading === undefined ? (
                <div className="spinner" />
              ) : count != null ? (
                <>
                  <div className="current-count" style={{ color: pool.color }}>{count}</div>
                  <div className="current-label">people now</div>
                  <Gauge value={count} max={350} color={pool.color} />
                </>
              ) : (
                <div className="current-label">No live data</div>
              )}
              {isRecent && (
                <div className="updated-at">
                  {new Date(reading.recorded_at).toLocaleTimeString("en-CH", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!isConfigured && (
        <div className="demo-banner">
          Demo mode — connect Supabase to see real data (see README.md)
        </div>
      )}

      {/* Range selector */}
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
        <DateRangePicker value={customRange} onChange={setCustomRange} onClear={() => setCustomRange(null)} />
      </div>

      {/* Occupancy over time */}
      <section className="card">
        <h2 className="card-title">Occupancy over time</h2>
        {error ? (
          <div className="error">Failed to load data: {error}</div>
        ) : loading ? (
          <div className="chart-loading">Loading…</div>
        ) : (
          <OccupancyChart series={chartSeries} range={chartRange} />
        )}
      </section>

      {/* Hourly averages */}
      {hourlySeries.some((s) => s.data.length > 0) && (
        <HourlyAverages series={hourlySeries} />
      )}

      {/* 7-day forecast */}
      {isConfigured && (
        <section className="card">
          <h2 className="card-title">7-day forecast</h2>
          <p className="card-subtitle">
            Predicted occupancy · powered by Darts + Open-Meteo weather ·
            updated daily · accuracy improves as more data accumulates
          </p>
          <ForecastChart series={forecastSeries} weather={dailyWeather} />
        </section>
      )}
    </div>
  );
}

function Gauge({ value, max, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="gauge-track">
      <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
