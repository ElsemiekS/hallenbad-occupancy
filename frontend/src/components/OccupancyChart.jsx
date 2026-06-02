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

// Week view: day name + weather icon + temp at noon ticks
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
          <text textAnchor="middle" y={30} fontSize={14}>{weatherIcon(w.precip)}</text>
          <text textAnchor="middle" y={46} fontSize={10} fill="#374151" fontWeight="600">
            {w.maxTemp}°C
          </text>
        </>
      )}
    </g>
  );
}

function formatTooltipTime(ts, range) {
  if (range === "24h")   return format(new Date(ts), "HH:mm");
  if (range === "week")  return format(new Date(ts), "EEE d MMM, HH:mm");
  if (range === "month") return format(new Date(ts), "EEE d MMM, HH:mm");
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

// series: [{ pool: { id, label, color, short, openStart, openEnd }, data: [{ ts, people_count }] }]
export function OccupancyChart({ series, range, weather }) {
  if (!series?.length || series.every((s) => !s.data?.length)) {
    return <div className="chart-empty">No data for this period</div>;
  }

  // Merge all series into one time-keyed map
  const byTs = new Map();
  for (const { pool, data } of series) {
    for (const point of data) {
      if (!byTs.has(point.ts)) byTs.set(point.ts, { ts: point.ts });
      byTs.get(point.ts)[pool.id] = point.people_count;
    }
  }

  // For every timestamp already in the map, force each pool's value to 0
  // when that pool is officially closed (hour outside its open window).
  // This handles three cases in one pass:
  //   - stray real readings after closing time (people still leaving)
  //   - early readings before opening (e.g. Ob. Letten at 08:50)
  //   - multi-pool gaps: timestamps from pool A during pool B's closed
  //     hours are filled with 0 so pool B's line is flat rather than
  //     floating/breaking in mid-air
  for (const [ts, row] of byTs) {
    const h = new Date(ts).getHours();
    for (const { pool } of series) {
      if (pool.openStart == null || pool.openEnd == null) continue;
      if (h < pool.openStart || h >= pool.openEnd) {
        row[pool.id] = 0;
      }
    }
  }

  const chartData = [...byTs.values()].sort((a, b) => a.ts - b.ts);
  const firstDayMidnight = startOfDay(new Date(chartData[0].ts));
  const lastTs = chartData[chartData.length - 1].ts;

  // Midnight separators and noon label ticks (week + month views)
  const midnightTicks = [];
  for (let d = firstDayMidnight; d.getTime() <= lastTs; d = addDays(d, 1)) {
    midnightTicks.push(d.getTime());
  }
  const noonTicks = midnightTicks.map((ts) => ts + 12 * 3600000);
  // Month: show ~5 evenly-spaced labels regardless of how many days of data exist
  const monthInterval = Math.max(1, Math.floor(noonTicks.length / 5));

  // 24h: ticks at every hour — labels every 2 hours, grid lines every hour
  const hourlyTicks = [];
  if (range === "24h") {
    for (let t = firstDayMidnight.getTime(); t <= lastTs + 3600000; t += 3600000) {
      hourlyTicks.push(t);
    }
  }

  const is24h  = range === "24h";
  const isWeek  = range === "week";
  const isMonth = range === "month";
  const hasSeparators = isWeek || isMonth;

  return (
    <ResponsiveContainer width="100%" height={isWeek ? 340 : 320}>
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 24, bottom: isWeek ? 58 : isMonth ? 24 : 4, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={hasSeparators ? [firstDayMidnight.getTime(), "dataMax"] : ["dataMin", "dataMax"]}
          ticks={
            is24h   ? hourlyTicks :
            isWeek  ? noonTicks :
            isMonth ? noonTicks :
            undefined
          }
          tick={
            isWeek ? (props) => <DayTick {...props} weather={weather} />
                   : { fontSize: 11, fill: "#6b7280" }
          }
          tickFormatter={
            is24h   ? (v) => { const h = new Date(v).getHours(); return h % 2 === 0 ? format(new Date(v), "HH:mm") : ""; } :
            isMonth ? (v) => format(new Date(v), "d MMM") :
            !isWeek ? (v) => format(new Date(v), "MMM ''yy") :
            undefined
          }
          tickLine={false}
          minTickGap={0}
          interval={
            is24h   ? 0 :
            isWeek  ? 0 :
            isMonth ? monthInterval :
            "preserveStartEnd"
          }
        />
        <YAxis
          domain={[0, "auto"]}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          width={36}
          label={{ value: "people", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fill: "#9ca3af" }}
        />
        <Tooltip content={<CustomTooltip range={range} series={series} />} />
        {hasSeparators && midnightTicks.slice(1).map((ts) => (
          <ReferenceLine
            key={ts}
            x={ts}
            stroke={isMonth ? "#f3f4f6" : "#d1d5db"}
            strokeWidth={1}
          />
        ))}
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
