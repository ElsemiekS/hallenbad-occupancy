import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

// ── single-pool bar chart (existing behaviour) ────────────────────────────────

function barColor(avg, max, closed) {
  if (closed) return "#e5e7eb";
  const ratio = max > 0 ? avg / max : 0;
  if (ratio < 0.4) return "#22c55e";
  if (ratio < 0.7) return "#f59e0b";
  return "#ef4444";
}

function SingleTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { label, closed } = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{label}</div>
      <div className="tooltip-count">
        {closed ? "Pool closed" : `avg ${payload[0].value} people`}
      </div>
    </div>
  );
}

function SinglePoolBars({ data }) {
  const byHour = Object.fromEntries(data.map((d) => [d.hour, d.avg_people]));
  const chartData = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    avg: h >= 6 && h < 22 ? (byHour[h] ?? 0) : 0,
    closed: h < 6 || h >= 22,
  }));
  const max = Math.max(...chartData.map((d) => d.avg));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={1} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
        <Tooltip content={<SingleTooltip />} cursor={{ fill: "#f3f4f6" }} />
        <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.label} fill={barColor(entry.avg, max, entry.closed)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── multi-pool line chart ─────────────────────────────────────────────────────

function MultiTooltip({ active, payload, series }) {
  if (!active || !payload?.length) return null;
  const hour = payload[0]?.payload?.hour;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{String(hour).padStart(2, "0")}:00</div>
      {series.map(({ pool }) => {
        const entry = payload.find((p) => p.dataKey === pool.id);
        if (!entry) return null;
        return (
          <div key={pool.id} className="tooltip-pool-row">
            <span className="tooltip-pool-dot" style={{ background: pool.color }} />
            <span>{pool.short}:</span>
            <span className="tooltip-count">avg {entry.value} people</span>
          </div>
        );
      })}
    </div>
  );
}

function MultiPoolLines({ series }) {
  // Build one row per hour with a column per pool
  const chartData = Array.from({ length: 24 }, (_, h) => {
    const row = { hour: h, label: `${String(h).padStart(2, "0")}:00` };
    for (const { pool, data } of series) {
      const found = data.find((d) => d.hour === h);
      row[pool.id] = found ? found.avg_people : 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={1} />
        <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
        <Tooltip content={<MultiTooltip series={series} />} />
        {series.map(({ pool }) => (
          <Line
            key={pool.id}
            type="monotone"
            dataKey={pool.id}
            stroke={pool.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── public component ──────────────────────────────────────────────────────────

// series: [{ pool: { id, label, color, short }, data: [{ hour, avg_people }] }]
export function HourlyAverages({ series }) {
  if (!series?.length || series.every((s) => !s.data?.length)) return null;

  return (
    <section className="card">
      <h2 className="card-title">Average by hour of day</h2>
      <p className="card-subtitle">Best time to go: quieter = fewer people (Zürich local time)</p>
      {series.length === 1
        ? <SinglePoolBars data={series[0].data} />
        : <MultiPoolLines series={series} />}
    </section>
  );
}
