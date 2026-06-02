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

  // ── Step 1: inject explicit open/close anchor timestamps ────────────────
  // The forced-0 pass below can only zero timestamps that already exist in
  // byTs. The pool with the longest open hours (e.g. Hallenbad 06–22) has
  // no data overnight — no other pool provides timestamps during that gap —
  // so without explicit anchors, its line connects last-reading → first-
  // morning-reading diagonally. Injecting a 0 at openEnd and openStart
  // per day per pool ensures those boundary points exist.
  if (byTs.size > 0) {
    const keys = [...byTs.keys()];
    const minTs = Math.min(...keys);
    const maxTs = Math.max(...keys);
    const BUFFER = 60 * 60000; // 1 h — prevents extending a 24h chart backward

    let day = startOfDay(new Date(minTs));
    const endDay = startOfDay(new Date(maxTs));
    while (day <= endDay) {
      for (const { pool } of series) {
        if (pool.openStart == null || pool.openEnd == null) continue;
        const dayMs = day.getTime();
        for (const ts of [
          dayMs + pool.openStart * 3600000, // open anchor
          dayMs + pool.openEnd   * 3600000, // close anchor
        ]) {
          if (ts < minTs - BUFFER || ts > maxTs + BUFFER) continue;
          if (!byTs.has(ts)) byTs.set(ts, { ts });
          byTs.get(ts)[pool.id] = 0; // always 0 at the boundary
        }
      }
      day = addDays(day, 1);
    }
  }

  // ── Step 2: force 0 for every closed-hour timestamp ──────────────────
  // Covers: stray real readings after close / before open, multi-pool
  // gaps (pool A timestamps during pool B's closed hours), and the
  // anchor points injected above.
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
