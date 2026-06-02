import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

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

// Shared bar chart — used for both single-pool (full width) and small multiples (half width)
function PoolBars({ data, openStart = 6, openEnd = 22, height = 220, interval = 1 }) {
  const byHour = Object.fromEntries(data.map((d) => [d.hour, d.avg_people]));
  const chartData = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    avg: h >= openStart && h < openEnd ? (byHour[h] ?? 0) : 0,
    closed: h < openStart || h >= openEnd,
  }));
  const max = Math.max(...chartData.map((d) => d.avg));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} interval={interval} />
        <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} width={30} />
        <Tooltip content={<SingleTooltip />} cursor={{ fill: "#f3f4f6" }} />
        <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
          {chartData.map((entry) => (
            <Cell key={entry.label} fill={barColor(entry.avg, max, entry.closed)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Multi-pool: one bar chart per pool in a 2-column grid
function SmallMultiples({ series }) {
  return (
    <div className="hourly-grid">
      {series.map(({ pool, data }) => (
        <div key={pool.id} className="hourly-grid-item">
          <div className="hourly-grid-header">
            <span className="hourly-grid-dot" style={{ background: pool.color }} />
            <span className="hourly-grid-label">{pool.short}</span>
          </div>
          <PoolBars
            data={data}
            openStart={pool.openStart}
            openEnd={pool.openEnd}
            height={170}
            interval={3}
          />
        </div>
      ))}
    </div>
  );
}

// series: [{ pool: { id, label, color, short, openStart, openEnd }, data: [{ hour, avg_people }] }]
export function HourlyAverages({ series }) {
  if (!series?.length || series.every((s) => !s.data?.length)) return null;

  return (
    <section className="card">
      <h2 className="card-title">Average by hour of day</h2>
      <p className="card-subtitle">Best time to go: quieter = fewer people (Zürich local time)</p>
      {series.length === 1 ? (
        <PoolBars
          data={series[0].data}
          openStart={series[0].pool.openStart}
          openEnd={series[0].pool.openEnd}
          height={220}
          interval={1}
        />
      ) : (
        <SmallMultiples series={series} />
      )}
    </section>
  );
}
