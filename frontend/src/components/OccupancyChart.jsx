import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";

const BLUE = "#2563eb";

// Format x-axis ticks based on the selected time range
function xTickFormatter(range) {
  if (range === "24h") return (v) => format(new Date(v), "HH:mm");
  if (range === "week") return (v) => format(new Date(v), "EEE HH:mm");
  return (v) => format(new Date(v), "MMM d");
}

// Custom tooltip shown on hover
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { recorded_at, people_count } = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{format(new Date(recorded_at), "EEE d MMM, HH:mm")}</div>
      <div className="tooltip-count">
        {people_count != null ? `${people_count} people` : "Pool closed"}
      </div>
    </div>
  );
}

export function OccupancyChart({ data, range }) {
  if (!data.length) {
    return <div className="chart-empty">No data for this period</div>;
  }

  // Draw a reference line at the historical average
  const validCounts = data.filter((d) => d.people_count != null).map((d) => d.people_count);
  const avg = validCounts.length
    ? Math.round(validCounts.reduce((a, b) => a + b, 0) / validCounts.length)
    : null;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="recorded_at"
          tickFormatter={xTickFormatter(range)}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          minTickGap={40}
        />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          width={36}
          label={{ value: "people", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
        />
        <Tooltip content={<CustomTooltip />} />
        {avg != null && (
          <ReferenceLine
            y={avg}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: `avg ${avg}`, position: "right", fontSize: 11, fill: "#f59e0b" }}
          />
        )}
        <Line
          type="monotone"
          dataKey="people_count"
          stroke={BLUE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
