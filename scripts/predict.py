"""
Daily prediction job: for each Zürich Badi, trains a Darts model on historical
occupancy + Open-Meteo weather data and stores a 7-day hourly forecast in the
Supabase `predictions` table.

Pool configuration comes from scraper/pools.py so adding a new pool only
requires one file change.
"""

import logging
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests
from supabase import create_client

# pools.py lives in the scraper/ directory; add it to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scraper"))
from pools import POOLS, PoolConfig  # noqa: E402  (path added above)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ── constants ─────────────────────────────────────────────────────────────────
ZURICH_LAT = 47.3769
ZURICH_LON = 8.5417
HORIZON_HOURS = 7 * 24     # 168 h — 7-day forecast
MIN_TRAIN_ROWS = 50        # minimum non-null training points per pool


# ── data fetching ─────────────────────────────────────────────────────────────

def fetch_occupancy(client, pool_id: str) -> pd.DataFrame:
    """Return all-time hourly bucketed occupancy for one pool (UTC index)."""
    result = client.rpc("get_occupancy_bucketed", {
        "p_pool_id": pool_id,
        "p_from": "2024-01-01T00:00:00Z",
        "p_to": datetime.now(timezone.utc).isoformat(),
        "p_bucket_secs": 3600,
    }).execute()
    df = pd.DataFrame(result.data)
    if df.empty:
        return pd.DataFrame(columns=["people_count"])
    df["bucket"] = pd.to_datetime(df["bucket"], utc=True)
    return df.set_index("bucket").sort_index()


def _parse_meteo_response(data: dict) -> pd.DataFrame:
    """Convert an Open-Meteo JSON response to a UTC-indexed DataFrame."""
    df = pd.DataFrame({
        "time": pd.to_datetime(data["hourly"]["time"]),
        "temperature_c": data["hourly"]["temperature_2m"],
        "precipitation_mm": data["hourly"]["precipitation"],
    })
    df["time"] = df["time"].dt.tz_localize("UTC")
    return df.set_index("time")


def fetch_weather_archive(start_date: str, end_date: str) -> pd.DataFrame:
    r = requests.get("https://archive-api.open-meteo.com/v1/archive", params={
        "latitude": ZURICH_LAT, "longitude": ZURICH_LON,
        "start_date": start_date, "end_date": end_date,
        "hourly": "temperature_2m,precipitation",
        "timezone": "UTC",
    }, timeout=30)
    r.raise_for_status()
    return _parse_meteo_response(r.json())


def fetch_weather_forecast(past_days: int = 14) -> pd.DataFrame:
    r = requests.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": ZURICH_LAT, "longitude": ZURICH_LON,
        "hourly": "temperature_2m,precipitation",
        "timezone": "UTC",
        "forecast_days": 9,
        "past_days": past_days,
    }, timeout=30)
    r.raise_for_status()
    return _parse_meteo_response(r.json())


def build_weather(occ_start: datetime) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns (all_weather, forecast_only).
    Weather is shared across all pools (same Zürich location).
    """
    today = datetime.now(timezone.utc).date()
    archive_end = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    archive_start = occ_start.strftime("%Y-%m-%d")

    log.info("Fetching archive weather %s → %s", archive_start, archive_end)
    archive = fetch_weather_archive(archive_start, archive_end)

    log.info("Fetching forecast weather (past 14 d + 9 d ahead)…")
    recent_and_fc = fetch_weather_forecast(past_days=14)

    combined = pd.concat([archive, recent_and_fc])
    combined = combined[~combined.index.duplicated(keep="last")].sort_index()

    now_h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecast_only = recent_and_fc[recent_and_fc.index > now_h].head(HORIZON_HOURS + 24)

    return combined, forecast_only


# ── modelling ─────────────────────────────────────────────────────────────────

def predict_darts(training: pd.DataFrame, fc_weather: pd.DataFrame) -> pd.Series:
    from darts import TimeSeries
    from darts.models import LinearRegressionModel

    LAGS = 24

    idx = pd.date_range(
        training.index.min().floor("h"),
        training.index.max().ceil("h"),
        freq="h", tz="UTC",
    )
    occ_full = training["people_count"].reindex(idx)
    weather_full = training[["temperature_c", "precipitation_mm"]].reindex(idx)
    weather_full = weather_full.ffill().bfill()

    n_valid = int(occ_full.notna().sum())
    if n_valid < MIN_TRAIN_ROWS:
        raise ValueError(f"Only {n_valid} valid occupancy rows — need ≥ {MIN_TRAIN_ROWS}")

    log.info("  Darts: %d hourly rows (%d non-null)", len(idx), n_valid)

    ts_target = TimeSeries.from_series(occ_full.astype(float), freq="h")
    ts_cov_hist = TimeSeries.from_dataframe(weather_full.astype(float), freq="h")

    fc_idx = pd.date_range(
        ts_cov_hist.end_time() + pd.Timedelta(hours=1),
        periods=HORIZON_HOURS + LAGS,
        freq="h", tz="UTC",
    )
    fc_aligned = fc_weather[["temperature_c", "precipitation_mm"]].reindex(fc_idx, method="nearest")
    ts_cov_fc = TimeSeries.from_dataframe(fc_aligned.astype(float), freq="h")
    ts_cov_full = ts_cov_hist.append(ts_cov_fc)

    model = LinearRegressionModel(
        lags=LAGS,
        lags_future_covariates=[0],
        output_chunk_length=24,
    )
    model.fit(ts_target, future_covariates=ts_cov_full)

    forecast = model.predict(HORIZON_HOURS, future_covariates=ts_cov_full)
    return forecast.pd_series().clip(0, 450).round().astype(int)


def predict_fallback(training: pd.DataFrame, fc_weather: pd.DataFrame) -> pd.Series:
    """Ridge regression with one-hot hour + weekday + weather features."""
    from sklearn.linear_model import Ridge

    def features(index: pd.DatetimeIndex, temp, rain) -> pd.DataFrame:
        local = index.tz_convert("Europe/Zurich")
        df = pd.DataFrame(index=index)
        for h in range(24):
            df[f"h_{h}"] = (local.hour == h).astype(float)
        for d in range(7):
            df[f"d_{d}"] = (local.dayofweek == d).astype(float)
        df["temp"] = np.asarray(temp)
        df["rain"] = np.asarray(rain)
        return df

    X_train = features(training.index, training["temperature_c"].values, training["precipitation_mm"].values)
    y_train = training["people_count"].values
    log.info("  Ridge: training on %d rows", len(X_train))
    model = Ridge(alpha=10.0).fit(X_train, y_train)

    X_fc = features(fc_weather.index, fc_weather["temperature_c"].values, fc_weather["precipitation_mm"].values)
    return pd.Series(model.predict(X_fc), index=fc_weather.index).clip(0, 450).round().astype(int)


def zero_closed_hours(preds: pd.Series, open_start: int, open_end: int) -> pd.Series:
    """Zero predictions outside this pool's opening hours."""
    local = preds.index.tz_convert("Europe/Zurich")
    mask = (local.hour >= open_start) & (local.hour < open_end)
    return preds.where(mask, other=0)


# ── persistence ───────────────────────────────────────────────────────────────

def store_predictions(client, pool_id: str, preds: pd.Series, model_name: str) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "pool_id": pool_id,
            "forecast_at": ts.isoformat(),
            "people_count_pred": int(val),
            "model_name": model_name,
            "generated_at": now_iso,
        }
        for ts, val in preds.items()
    ]
    client.table("predictions").upsert(rows, on_conflict="pool_id,forecast_at").execute()
    log.info("  Stored %d predictions (model: %s)", len(rows), model_name)


# ── per-pool pipeline ─────────────────────────────────────────────────────────

def run_pool(client, pool: PoolConfig, all_weather: pd.DataFrame, fc_weather: pd.DataFrame) -> None:
    log.info("── %s (%s) ──", pool.label, pool.pool_id)

    occ = fetch_occupancy(client, pool.pool_id)
    if occ.empty or len(occ) < 5:
        log.warning("  Not enough occupancy data — skipping")
        return

    training = occ.join(all_weather, how="inner").dropna(subset=["people_count"])
    log.info("  %d training rows with matched weather", len(training))

    now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    fc_window = fc_weather[
        (fc_weather.index > now_utc) &
        (fc_weather.index <= now_utc + timedelta(hours=HORIZON_HOURS))
    ]

    try:
        preds = predict_darts(training, fc_window)
        model_name = "LinearRegressionModel"
        log.info("  Darts model succeeded")
    except Exception as exc:
        log.warning("  Darts failed (%s) — falling back to Ridge", exc)
        preds = predict_fallback(training, fc_window)
        model_name = "ridge_fallback"

    preds = zero_closed_hours(preds, pool.open_start, pool.open_end)
    preds = preds[preds.index <= now_utc + timedelta(hours=HORIZON_HOURS)]
    log.info("  %d predictions ready (%d non-zero)", len(preds), int((preds > 0).sum()))

    store_predictions(client, pool.pool_id, preds, model_name)


# ── entrypoint ────────────────────────────────────────────────────────────────

def main() -> None:
    client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )

    # Fetch weather once — all pools are in Zürich
    earliest_occ_start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    all_weather, fc_weather = build_weather(earliest_occ_start)

    for pool in POOLS:
        try:
            run_pool(client, pool, all_weather, fc_weather)
        except Exception as exc:
            log.error("Pool %s failed unexpectedly: %s", pool.pool_id, exc)

    log.info("Done.")


if __name__ == "__main__":
    main()
