"""
Hallenbad City occupancy scraper.
Reads the live visitor count from the Zurich city website and writes it to Supabase.
Designed to run as a short-lived process (e.g. GitHub Actions cron every 5 minutes).
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

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

POOL_URL = (
    "https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung"
    "/sport-und-badeanlagen/hallenbaeder/city.html"
)
# The website changed in 2026: SSD-4 now shows occupancy-level icons (1–4 scale),
# while SSD-4_visitornumber holds the actual guest count as a plain number.
OCCUPANCY_ELEMENT_ID = "SSD-4_visitornumber"
POOL_ID = "hallenbad_city"


@dataclass
class OccupancyReading:
    pool_id: str
    people_count: int | None  # None when the pool is closed or data unavailable
    recorded_at: datetime


class HallenbadScraper:
    """Fetches the current occupancy from the Zurich Hallenbad City website."""

    def __init__(self) -> None:
        options = Options()
        options.add_argument("--headless=new")
        # Required flags when running in CI / Docker containers
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        self._driver = webdriver.Chrome(options=options)

    def __enter__(self) -> "HallenbadScraper":
        return self

    def __exit__(self, *_) -> None:
        self._driver.quit()

    def scrape(self) -> OccupancyReading:
        """Load the page and extract the visitor count element."""
        self._driver.get(POOL_URL)

        # Wait up to 20 s for the element to exist, then up to 20 s more for it
        # to be populated with a real value (the JS fills it asynchronously).
        WebDriverWait(self._driver, 20).until(
            EC.presence_of_element_located((By.ID, OCCUPANCY_ELEMENT_ID))
        )
        try:
            WebDriverWait(self._driver, 20).until(
                lambda d: d.find_element(By.ID, OCCUPANCY_ELEMENT_ID).text.strip() not in ("", "-")
            )
        except TimeoutException:
            # Pool is closed or the live-data service is temporarily down
            log.warning("Visitor count did not populate within 20 s — pool likely closed")
            return OccupancyReading(pool_id=POOL_ID, people_count=None,
                                    recorded_at=datetime.now(tz=timezone.utc))

        element = self._driver.find_element(By.ID, OCCUPANCY_ELEMENT_ID)
        raw = element.text.strip()
        count = int(raw) if raw.isdigit() else None
        if count is None:
            log.warning("Non-numeric occupancy value: %r", raw)

        return OccupancyReading(
            pool_id=POOL_ID,
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
            "Saved: %s people at %s",
            reading.people_count,
            reading.recorded_at.strftime("%H:%M UTC"),
        )


def main() -> None:
    with HallenbadScraper() as scraper:
        reading = scraper.scrape()

    log.info("Scraped: %s people", reading.people_count)
    writer = SupabaseWriter()
    writer.write(reading)


if __name__ == "__main__":
    main()
