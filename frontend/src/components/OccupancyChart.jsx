import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

function xTickFormatter(range) {
  if (range === "24h")   return (v) => format(new Date(v), "HH:mm");
  if (range === "week")  return (v) => format(new Date(v), "EEE HH:mm");
  if (range === "month") return (v) => format(new Date(v), "MMM d");
  return (v) => format(new Date(v), "MMM ''yy");
}

function formatTooltipTime(ts, range) {
  if (range === "24h")   return format(new Date(ts), "EEE d MMM, HH:mm");
  if (range === "week")  return format(new Date(ts), "EEE d MMM, HH:mm");
  if (range === "month") return format(new Date(ts), "EEE d MMM yyyy");
  return format(new Date(ts), "d MMM yyyy");
}

function CustomTooltip({ active, payload, range, series }) {
  if (!active || !payload?.length) return null;
  const ts = payload[0]?.payload?.ts;
  if (!ts) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{formatTooltipTime(ts, range)}</div>
      {series.map(({ pool }) => {
        const entry = payload.find((p) => p.dataKey === pool.id);
        if (!entry) return null;
        return (
          <div key={pool.id} className="tooltip-pool-row">
            <span className="tooltip-pool-dot" style={{ background: pool.color }} />
            <span>{pool.short}:</span>
            <span className="tooltip-count">
              {entry.value != null ? `${entry.value} people` : "closed"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// series: [{ pool: { id, label, color, short }, data: [{ ts, people_count }] }]
export function OccupancyChart({ series, range }) {
  if (!series?.length || series.every((s) => !s.data?.length)) {
    return <div className="chart-empty">No data for this period</div>;
  }

  // Merge all series into one array keyed by timestamp
  const byTs = new Map();
  for (const { pool, data } of series) {
    for (const point of data) {
      if (!byTs.has(point.ts)) byTs.set(point.ts, { ts: point.ts });
      byTs.get(point.ts)[pool.id] = point.people_count;
    }
  }
  const chartData = [...byTs.values()].sort((a, b) => a.ts - b.ts);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={xTickFormatter(range)}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          minTickGap={60}
        />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          width={36}
          label={{ value: "people", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
        />
        <Tooltip content={<CustomTooltip range={range} series={series} />} />
        {series.map(({ pool }) => (
          <Line
            key={pool.id}
            type="monotone"
            dataKey={pool.id}
            stroke={pool.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
