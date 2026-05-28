import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { format, startOfDay, addDays } from "date-fns";

function weatherIcon(precip) {
  if (precip >= 2)   return "🌧️";
  if (precip >= 0.3) return "🌦️";
  return "☀️";
}

function CustomTooltip({ active, payload, series }) {
  if (!active || !payload?.length) return null;
  const ts = payload[0]?.payload?.ts;
  if (!ts) return null;
  return (
    <div className="tooltip">
      <div className="tooltip-time">{format(new Date(ts), "EEE d MMM, HH:mm")}</div>
      {series.map(({ pool }) => {
        const entry = payload.find((p) => p.dataKey === pool.id);
        if (!entry) return null;
        return (
          <div key={pool.id} className="tooltip-pool-row">
            <span className="tooltip-pool-dot" style={{ background: pool.color }} />
            <span>{pool.short}:</span>
            <span className="tooltip-count">~{entry.value} people</span>
          </div>
        );
      })}
    </div>
  );
}

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
          <text textAnchor="middle" y={32} fontSize={15}>{weatherIcon(w.precip)}</text>
          <text textAnchor="middle" y={49} fontSize={10} fill="#374151" fontWeight="600">
            {w.maxTemp}°C
          </text>
        </>
      )}
    </g>
  );
}

// series:  [{ pool: { id, label, color, short }, data: [{ forecast_at, people_count_pred, model_name }] }]
// weather: [{ date, maxTemp, precip }]
export function ForecastChart({ series, weather }) {
  const hasSeries = series?.some((s) => s.data?.length > 0);

  if (!hasSeries) {
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

  const anyFallback = series.some((s) =>
    s.data?.some((d) => d.model_name === "ridge_fallback")
  );

  // Merge all series into one time-keyed array
  const byTs = new Map();
  for (const { pool, data } of series) {
    for (const d of data ?? []) {
      const ts = new Date(d.forecast_at).getTime();
      if (!byTs.has(ts)) byTs.set(ts, { ts });
      byTs.get(ts)[pool.id] = d.people_count_pred;
    }
  }
  const chartData = [...byTs.values()].sort((a, b) => a.ts - b.ts);

  const firstDayMidnight = startOfDay(new Date(chartData[0].ts));
  const lastPoint = new Date(chartData[chartData.length - 1].ts);

  const midnightTicks = [];
  for (let d = firstDayMidnight; d <= lastPoint; d = addDays(d, 1)) {
    midnightTicks.push(d.getTime());
  }
  const noonTicks = midnightTicks.map((ts) => ts + 12 * 60 * 60 * 1000);

  return (
    <>
      {anyFallback && (
        <div className="forecast-fallback-banner">
          Using a simplified model for one or more pools — not enough consecutive
          data yet. Predictions will improve automatically as more readings accumulate.
        </div>
      )}
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 58, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[firstDayMidnight.getTime(), "dataMax"]}
            ticks={noonTicks}
            tick={(props) => <DayTick {...props} weather={weather} />}
            tickLine={false}
            interval={0}
          />
          <YAxis
            domain={[0, "auto"]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            width={36}
            label={{ value: "people", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
          />
          <Tooltip content={<CustomTooltip series={series} />} />
          {midnightTicks.slice(1).map((ts) => (
            <ReferenceLine key={ts} x={ts} stroke="#d1d5db" strokeWidth={1} />
          ))}
          {series.map(({ pool }) => (
            <Line
              key={pool.id}
              type="monotone"
              dataKey={pool.id}
              stroke={pool.color}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, fill: pool.color }}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
