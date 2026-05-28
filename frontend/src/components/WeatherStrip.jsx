import { format } from "date-fns";

function icon(precipMm) {
  if (precipMm >= 2)   return "🌧️";
  if (precipMm >= 0.3) return "🌦️";
  return "☀️";
}

// days: [{ date: "YYYY-MM-DD", maxTemp: number, precip: number }]
export function WeatherStrip({ days }) {
  if (!days?.length) return null;
  return (
    <div className="weather-strip">
      {days.map((d) => {
        // Parse as local noon so the day name never shifts due to UTC midnight
        const date = new Date(`${d.date}T12:00:00`);
        return (
          <div key={d.date} className="weather-day">
            <div className="weather-day-name">{format(date, "EEE d")}</div>
            <div className="weather-day-icon">{icon(d.precip)}</div>
            <div className="weather-day-temp">{d.maxTemp}°C</div>
          </div>
        );
      })}
    </div>
  );
}
