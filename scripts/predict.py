"""
Daily prediction job: trains a Darts LinearRegressionModel on historical
occupancy + Open-Meteo weather data, then stores a 7-day hourly forecast in
the Supabase `predictions` table.

Weather is fetched directly from Open-Meteo (free, no API key needed).
Historical archive covers 2024 onwards; the forecast API supplies recent data
and the next 9 days.

Falls back to a Ridge regression on cyclic time + weather features when there
is not enough *consecutive* data for Darts to build valid lag windows.
"""

import logging
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import requests
from supabase import create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ── constants ─────────────────────────────────────────────────────────────────
POOL_ID = "hallenbad_city"
ZURICH_LAT = 47.3769
ZURICH_LON = 8.5417
HORIZON_HOURS = 7 * 24     # 168 h — 7-day forecast
OPEN_START = 6             # 06:00 Zürich — pool opens
OPEN_END = 22              # 22:00 Zürich — pool closes
MIN_TRAIN_ROWS = 50        # minimum non-null training points


# ── data fetching ─────────────────────────────────────────────────────────────

def fetch_occupancy(client) -> pd.DataFrame:
    """Return all-time hourly bucketed occupancy from Supabase (UTC index)."""
    result = client.rpc("get_occupancy_bucketed", {
        "p_pool_id": POOL_ID,
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
    """Convert an Open-Meteo JSON response to a UTC-indexed DataFrame.

    We request timezone=UTC from Open-Meteo so the timestamps are already UTC
    — avoids any DST ambiguity issues with Europe/Zurich localization.
    """
    df = pd.DataFrame({
        "time": pd.to_datetime(data["hourly"]["time"]),
        "temperature_c": data["hourly"]["temperature_2m"],
        "precipitation_mm": data["hourly"]["precipitation"],
    })
    df["time"] = df["time"].dt.tz_localize("UTC")
    return df.set_index("time")


def fetch_weather_archive(start_date: str, end_date: str) -> pd.DataFrame:
    url = "https://archive-api.open-meteo.com/v1/archive"
    r = requests.get(url, params={
        "latitude": ZURICH_LAT, "longitude": ZURICH_LON,
        "start_date": start_date, "end_date": end_date,
        "hourly": "temperature_2m,precipitation",
        "timezone": "UTC",
    }, timeout=30)
    r.raise_for_status()
    return _parse_meteo_response(r.json())


def fetch_weather_forecast(past_days: int = 14) -> pd.DataFrame:
    """Forecast API: includes `past_days` of recent history + 9 days ahead."""
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
    `all_weather` covers occ_start → now (archive + recent).
    `forecast_only` covers now → +9 days (for feeding into the model).
    """
    today = datetime.now(timezone.utc).date()
    # Archive API has a lag of ~1-5 days, so request up to 7 days ago to be safe
    archive_end = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    archive_start = occ_start.strftime("%Y-%m-%d")

    log.info("Fetching archive weather %s → %s", archive_start, archive_end)
    archive = fetch_weather_archive(archive_start, archive_end)

    # Forecast API with past_days=14 fills the gap and covers the future
    log.info("Fetching forecast weather (past 14 d + 9 d ahead)…")
    recent_and_fc = fetch_weather_forecast(past_days=14)

    # Merge: archive covers the distant past; recent_and_fc wins for overlapping
    combined = pd.concat([archive, recent_and_fc])
    combined = combined[~combined.index.duplicated(keep="last")].sort_index()

    now_h = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    forecast_only = recent_and_fc[recent_and_fc.index > now_h].head(HORIZON_HOURS + 24)

    return combined, forecast_only


# ── modelling ─────────────────────────────────────────────────────────────────

def predict_darts(training: pd.DataFrame, fc_weather: pd.DataFrame) -> pd.Series:
    """
    Train a Darts LinearRegressionModel with 24-hour lags + weather covariates,
    then auto-regressively predict the next HORIZON_HOURS hours.

    Training data is a merged occupancy + weather DataFrame (UTC index, hourly
    frequency, NaN where pool was closed or scraper missed).  Darts skips any
    lag window that contains NaN, so sparse data is handled gracefully — the
    model only learns from windows where all 24 preceding hours are known.
    """
    from darts import TimeSeries
    from darts.models import LinearRegressionModel

    LAGS = 24

    # ── build a complete hourly index from earliest to latest ─────────────────
    idx = pd.date_range(
        training.index.min().floor("h"),
        training.index.max().ceil("h"),
        freq="h", tz="UTC",
    )
    occ_full = training["people_count"].reindex(idx)
    weather_full = training[["temperature_c", "precipitation_mm"]].reindex(idx)
    # Forward-fill weather gaps (weather changes slowly; scraper gaps rarely matter)
    weather_full = weather_full.ffill().bfill()

    # ── check we have enough non-null windows ─────────────────────────────────
    n_valid = int(occ_full.notna().sum())
    if n_valid < MIN_TRAIN_ROWS:
        raise ValueError(f"Only {n_valid} valid occupancy rows — need ≥ {MIN_TRAIN_ROWS}")

    log.info("Building Darts TimeSeries from %d hourly rows (%d non-null)", len(idx), n_valid)

    ts_target = TimeSeries.from_series(occ_full.astype(float), freq="h")
    ts_cov_hist = TimeSeries.from_dataframe(weather_full.astype(float), freq="h")

    # ── future covariate series: covers both history and forecast horizon ─────
    fc_idx = pd.date_range(
        ts_cov_hist.end_time() + pd.Timedelta(hours=1),
        periods=HORIZON_HOURS + LAGS,
        freq="h", tz="UTC",
    )
    # Interpolate or ffill forecast weather onto the exact needed index
    fc_aligned = fc_weather[["temperature_c", "precipitation_mm"]].reindex(fc_idx, method="nearest")
    ts_cov_fc = TimeSeries.from_dataframe(fc_aligned.astype(float), freq="h")
    ts_cov_full = ts_cov_hist.append(ts_cov_fc)

    # ── train ─────────────────────────────────────────────────────────────────
    model = LinearRegressionModel(
        lags=LAGS,
        lags_future_covariates=[0],  # use weather at the predicted hour
        output_chunk_length=24,      # predict a full day at once (less drift)
    )
    log.info("Training Darts LinearRegressionModel…")
    model.fit(ts_target, future_covariates=ts_cov_full)

    # ── predict ───────────────────────────────────────────────────────────────
    log.info("Generating %d-hour forecast…", HORIZON_HOURS)
    forecast = model.predict(HORIZON_HOURS, future_covariates=ts_cov_full)
    return forecast.pd_series().clip(0, 450).round().astype(int)


def predict_fallback(training: pd.DataFrame, fc_weather: pd.DataFrame) -> pd.Series:
    """
    Fallback when Darts can't build valid lag windows (data too sparse).
    Uses Ridge regression on cyclic hour/weekday encodings + weather.
    No temporal dependencies — just learns the typical daily pattern and how
    temperature / rain nudge occupancy up or down.
    """
    from sklearn.linear_model import Ridge

    def features(index: pd.DatetimeIndex, temp, rain) -> pd.DataFrame:
        local = index.tz_convert("Europe/Zurich")
        return pd.DataFrame({
            "h_sin": np.sin(2 * np.pi * local.hour / 24),
            "h_cos": np.cos(2 * np.pi * local.hour / 24),
            "d_sin": np.sin(2 * np.pi * local.dayofweek / 7),
            "d_cos": np.cos(2 * np.pi * local.dayofweek / 7),
            "temp":  np.asarray(temp),
            "rain":  np.asarray(rain),
        }, index=index)

    X_train = features(
        training.index,
        training["temperature_c"].values,
        training["precipitation_mm"].values,
    )
    y_train = training["people_count"].values

    log.info("Training Ridge regression on %d rows…", len(X_train))
    model = Ridge(alpha=10.0).fit(X_train, y_train)

    X_fc = features(
        fc_weather.index,
        fc_weather["temperature_c"].values,
        fc_weather["precipitation_mm"].values,
    )
    preds = pd.Series(model.predict(X_fc), index=fc_weather.index)
    return preds.clip(0, 450).round().astype(int)


def zero_closed_hours(preds: pd.Series) -> pd.Series:
    """Set predictions to 0 outside pool opening hours (06:00–22:00 Zürich).

    Closed hours are stored as 0 (not dropped) so the forecast chart shows a
    flat zero line at night rather than gaps.
    """
    local = preds.index.tz_convert("Europe/Zurich")
    mask = (local.hour >= OPEN_START) & (local.hour < OPEN_END)
    return preds.where(mask, other=0)


# ── persistence ───────────────────────────────────────────────────────────────

def store_predictions(client, preds: pd.Series) -> None:
    now_iso = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "pool_id": POOL_ID,
            "forecast_at": ts.isoformat(),
            "people_count_pred": int(val),
            "generated_at": now_iso,
        }
        for ts, val in preds.items()
    ]
    client.table("predictions").upsert(rows, on_conflict="pool_id,forecast_at").execute()
    log.info("Stored %d predictions", len(rows))


# ── entrypoint ────────────────────────────────────────────────────────────────

def main() -> None:
    client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )

    # ── fetch occupancy ───────────────────────────────────────────────────────
    log.info("Fetching occupancy data…")
    occ = fetch_occupancy(client)
    if occ.empty:
        log.error("No occupancy data found — nothing to train on")
        sys.exit(1)
    log.info("%d hourly occupancy rows fetched (earliest: %s)", len(occ), occ.index.min().date())

    # ── fetch weather ─────────────────────────────────────────────────────────
    all_weather, fc_weather = build_weather(occ.index.min())

    # ── merge training data ───────────────────────────────────────────────────
    training = occ.join(all_weather, how="inner").dropna(subset=["people_count"])
    log.info("%d training rows with matched weather", len(training))

    # ── predict ───────────────────────────────────────────────────────────────
    now_utc = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    # Trim forecast to the 7-day horizon
    fc_window = fc_weather[
        (fc_weather.index > now_utc) &
        (fc_weather.index <= now_utc + timedelta(hours=HORIZON_HOURS))
    ]

    try:
        preds = predict_darts(training, fc_window)
        log.info("Darts model succeeded")
    except Exception as exc:
        log.warning("Darts failed (%s) — falling back to Ridge regression", exc)
        preds = predict_fallback(training, fc_window)

    # Zero out closed hours; trim to the 7-day window
    preds = zero_closed_hours(preds)
    preds = preds[preds.index <= now_utc + timedelta(hours=HORIZON_HOURS)]
    log.info("%d predictions ready (%d non-zero open hours)", len(preds), int((preds > 0).sum()))

    # ── store ─────────────────────────────────────────────────────────────────
    store_predictions(client, preds)
    log.info("Done.")


if __name__ == "__main__":
    main()
