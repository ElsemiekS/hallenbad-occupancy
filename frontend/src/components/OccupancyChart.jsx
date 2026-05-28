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

// Format x-axis tick labels — show more detail for shorter ranges
function xTickFormatter(range) {
  if (range === "24h")  return (v) => format(new Date(v), "HH:mm");
  if (range === "week") return (v) => format(new Date(v), "EEE HH:mm");
  if (range === "month") return (v) => format(new Date(v), "MMM d");
  // All time: show month + year so multi-year data is unambiguous
  return (v) => format(new Date(v), "MMM ''yy");
}

// Tooltip label based on aggregation level
function formatTooltipTime(ts, range) {
  if (range === "24h")   return format(new Date(ts), "EEE d MMM, HH:mm");
  if (range === "week")  return format(new Date(ts), "EEE d MMM, HH:mm");
  if (range === "month") return format(new Date(ts), "EEE d MMM yyyy");
  return format(new Date(ts), "d MMM yyyy");
}

function CustomTooltip({ active, payload, range }) {
  if (!active || !payload?.length) return null;
  const { ts, people_count } = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{formatTooltipTime(ts, range)}</div>
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

  const avg = data.length
    ? Math.round(data.reduce((s, d) => s + d.people_count, 0) / data.length)
    : null;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

        {/*
          type="number" + scale="time" makes the x-axis a uniform time scale:
          1 hour always occupies the same width regardless of how many data
          points fall within it. Without this, dense periods look artificially
          wider than sparse ones.
        */}
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

        <Tooltip content={<CustomTooltip range={range} />} />

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
