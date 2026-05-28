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
import { format, startOfDay, addDays } from "date-fns";

const PURPLE = "#7c3aed";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { ts, value } = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{format(new Date(ts), "EEE d MMM, HH:mm")}</div>
      <div className="tooltip-count">~{value} people (predicted)</div>
    </div>
  );
}

// data: [{ forecast_at: string, people_count_pred: number }]
export function ForecastChart({ data }) {
  if (!data?.length) {
    return (
      <div className="chart-empty forecast-empty">
        <span>
          No predictions yet — the model runs daily once enough data has
          accumulated. Trigger it manually via GitHub Actions to generate the
          first forecast.
        </span>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ts: new Date(d.forecast_at).getTime(),
    value: d.people_count_pred,
  }));

  // Vertical day-separator lines
  const firstDay = startOfDay(new Date(chartData[0].ts));
  const lastDay = new Date(chartData[chartData.length - 1].ts);
  const dayLines = [];
  for (let d = addDays(firstDay, 1); d <= lastDay; d = addDays(d, 1)) {
    dayLines.push(d.getTime());
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v) => format(new Date(v), "EEE d")}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          minTickGap={60}
        />

        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 11, fill: "#6b7280" }}
          width={36}
          label={{
            value: "people",
            angle: -90,
            position: "insideLeft",
            offset: 10,
            fontSize: 11,
            fill: "#9ca3af",
          }}
        />

        <Tooltip content={<CustomTooltip />} />

        {dayLines.map((ts) => (
          <ReferenceLine key={ts} x={ts} stroke="#d1d5db" strokeWidth={1} />
        ))}

        {/* Dashed purple line = forecast (visually distinct from the solid blue actual-data line) */}
        <Line
          type="monotone"
          dataKey="value"
          stroke={PURPLE}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4, fill: PURPLE }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
