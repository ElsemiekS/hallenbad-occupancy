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

function weatherIcon(precip) {
  if (precip >= 2)   return "🌧️";
  if (precip >= 0.3) return "🌦️";
  return "☀️";
}

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

// Custom XAxis tick rendered at each midnight boundary.
// Shows day name + weather icon + max temperature, perfectly aligned with the
// day-separator reference lines because they share the same tick positions.
function DayTick({ x, y, payload, weather }) {
  const dateStr = format(new Date(payload.value), "yyyy-MM-dd");
  const w = weather?.find((d) => d.date === dateStr);
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" y={14} fontSize={11} fill="#6b7280">
        {format(new Date(payload.value), "EEE d")}
      </text>
      {w && (
        <>
          <text textAnchor="middle" y={32} fontSize={15}>
            {weatherIcon(w.precip)}
          </text>
          <text textAnchor="middle" y={49} fontSize={10} fill="#374151" fontWeight="600">
            {w.maxTemp}°C
          </text>
        </>
      )}
    </g>
  );
}

// data:    [{ forecast_at: string, people_count_pred: number }]
// weather: [{ date: "YYYY-MM-DD", maxTemp: number, precip: number }]
export function ForecastChart({ data, weather }) {
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

  // Extend the domain back to today's midnight so each day occupies the same
  // width and the weather tick for today is at the left edge of its column.
  const firstDayMidnight = startOfDay(new Date(chartData[0].ts));
  const lastPoint = new Date(chartData[chartData.length - 1].ts);

  // One tick per midnight, including today's
  const dayTicks = [];
  for (let d = firstDayMidnight; d <= lastPoint; d = addDays(d, 1)) {
    dayTicks.push(d.getTime());
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 58, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={[firstDayMidnight.getTime(), "dataMax"]}
          ticks={dayTicks}
          tick={(props) => <DayTick {...props} weather={weather} />}
          tickLine={{ stroke: "#e5e7eb" }}
          interval={0}
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

        {/* Skip the first tick (left edge) to avoid a line on top of the Y-axis */}
        {dayTicks.slice(1).map((ts) => (
          <ReferenceLine key={ts} x={ts} stroke="#d1d5db" strokeWidth={1} />
        ))}

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
