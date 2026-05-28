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

// Compute the average occupancy per hour-of-day across all data
function buildHourlyAverages(data) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0, count: 0 }));
  for (const d of data) {
    if (d.people_count == null) continue;
    const h = new Date(d.recorded_at).getHours();
    buckets[h].total += d.people_count;
    buckets[h].count += 1;
  }
  return buckets
    .filter((b) => b.count > 0)
    .map((b) => ({
      hour: `${String(b.hour).padStart(2, "0")}:00`,
      avg: Math.round(b.total / b.count),
    }));
}

function barColor(avg, max) {
  // Green → orange → red based on how busy it is
  const ratio = max > 0 ? avg / max : 0;
  if (ratio < 0.4) return "#22c55e";
  if (ratio < 0.7) return "#f59e0b";
  return "#ef4444";
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{payload[0].payload.hour}</div>
      <div className="tooltip-count">avg {payload[0].value} people</div>
    </div>
  );
}

export function HourlyAverages({ data }) {
  const hourly = buildHourlyAverages(data);
  if (!hourly.length) return null;

  const max = Math.max(...hourly.map((h) => h.avg));

  return (
    <section className="card">
      <h2 className="card-title">Average by hour of day</h2>
      <p className="card-subtitle">Best time to go: quieter bars = fewer people</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={hourly} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#6b7280" }} interval={1} />
          <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} width={36} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
          <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
            {hourly.map((entry) => (
              <Cell key={entry.hour} fill={barColor(entry.avg, max)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
