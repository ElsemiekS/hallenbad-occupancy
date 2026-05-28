import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

function barColor(avg, max, closed) {
  if (closed) return "#e5e7eb"; // pool closed — neutral grey
  const ratio = max > 0 ? avg / max : 0;
  if (ratio < 0.4) return "#22c55e";
  if (ratio < 0.7) return "#f59e0b";
  return "#ef4444";
}

function CustomTooltip({ active, payload }) {
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

// data: [{ hour: 0–23, avg_people: number }] — pre-computed by DB or demo logic
export function HourlyAverages({ data }) {
  if (!data?.length) return null;

  // Show all 24 hours; closed hours (outside 06:00–22:00) always show 0
  const byHour = Object.fromEntries(data.map((d) => [d.hour, d.avg_people]));
  const chartData = Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}:00`,
    avg: h >= 6 && h < 22 ? (byHour[h] ?? 0) : 0,
    closed: h < 6 || h >= 22,
  }));

  const max = Math.max(...chartData.map((d) => d.avg));

  return (
    <section className="card">
      <h2 className="card-title">Average by hour of day</h2>
      <p className="card-subtitle">Best time to go: quieter bars = fewer people (Zürich local time)</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} interval={1} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.label} fill={barColor(entry.avg, max, entry.closed)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
