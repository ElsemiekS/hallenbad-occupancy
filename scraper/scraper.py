"""
Zürich Badi occupancy scraper.
Reads the live visitor count from each pool's page on the Zurich city website
and writes the readings to Supabase. Designed to run as a short-lived process
(GitHub Actions cron, triggered externally every 5 minutes via cron-job.org).

All pool configuration lives in pools.py — add a new pool there and it is
picked up automatically here.
"""

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.support.ui import WebDriverWait
from supabase import create_client

from pools import POOLS, PoolConfig

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)


@dataclass
class OccupancyReading:
    pool_id: str
    people_count: int | None  # None when the pool is closed or data unavailable
    recorded_at: datetime


class BadiScraper:
    """
    Scrapes live occupancy from Stadt Zürich pool pages.
    One Chrome instance is reused across all pools to keep the run fast.
    """

    def __init__(self) -> None:
        options = Options()
        options.add_argument("--headless=new")
        # Required flags when running in CI / Docker containers
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        self._driver = webdriver.Chrome(options=options)

    def __enter__(self) -> "BadiScraper":
        return self

    def __exit__(self, *_) -> None:
        self._driver.quit()

    def scrape(self, pool: PoolConfig) -> OccupancyReading:
        """Load the pool page and extract the visitor count element."""
        self._driver.get(pool.url)

        # Wait up to 20 s for the element to exist, then up to 20 s more for it
        # to be populated with a real value (the JS fills it asynchronously).
        try:
            WebDriverWait(self._driver, 20).until(
                EC.presence_of_element_located((By.ID, pool.element_id))
            )
        except TimeoutException:
            log.warning("[%s] Element %r not found within 20 s — skipping", pool.pool_id, pool.element_id)
            return OccupancyReading(pool_id=pool.pool_id, people_count=None,
                                    recorded_at=datetime.now(tz=timezone.utc))

        try:
            WebDriverWait(self._driver, 20).until(
                lambda d: d.find_element(By.ID, pool.element_id).text.strip() not in ("", "-")
            )
        except TimeoutException:
            # Pool is closed or the live-data service is temporarily down
            log.warning("[%s] Visitor count did not populate within 20 s — pool likely closed", pool.pool_id)
            return OccupancyReading(pool_id=pool.pool_id, people_count=None,
                                    recorded_at=datetime.now(tz=timezone.utc))

        element = self._driver.find_element(By.ID, pool.element_id)
        raw = element.text.strip()
        count = int(raw) if raw.isdigit() else None
        if count is None:
            log.warning("[%s] Non-numeric occupancy value: %r", pool.pool_id, raw)

        return OccupancyReading(
            pool_id=pool.pool_id,
            people_count=count,
            recorded_at=datetime.now(tz=timezone.utc),
        )


class SupabaseWriter:
    """Persists occupancy readings to a Supabase (PostgreSQL) table."""

    TABLE = "occupancy"

    def __init__(self) -> None:
        url = os.environ["SUPABASE_URL"]
        # Use the service-role key so we can INSERT (anon key is read-only)
        key = os.environ["SUPABASE_SERVICE_KEY"]
        self._client = create_client(url, key)

    def write(self, reading: OccupancyReading) -> None:
        self._client.table(self.TABLE).insert(
            {
                "pool_id": reading.pool_id,
                "people_count": reading.people_count,
                "recorded_at": reading.recorded_at.isoformat(),
            }
        ).execute()
        log.info(
            "[%s] Saved: %s people at %s UTC",
            reading.pool_id,
            reading.people_count,
            reading.recorded_at.strftime("%H:%M"),
        )


def main() -> None:
    writer = SupabaseWriter()
    with BadiScraper() as scraper:
        for pool in POOLS:
            try:
                reading = scraper.scrape(pool)
                writer.write(reading)
            except Exception as exc:
                # Log and continue — one failing pool should not block the others
                log.error("[%s] Scrape failed: %s", pool.pool_id, exc)


if __name__ == "__main__":
    main()
