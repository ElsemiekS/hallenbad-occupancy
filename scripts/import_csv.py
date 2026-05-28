"""
One-time script to import existing CSV data into Supabase.
Run once after setting up the database.

Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python scripts/import_csv.py
"""

import csv
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

POOL_ID = "hallenbad_city"
# Batch size for Supabase inserts (avoids hitting request size limits)
BATCH_SIZE = 500

CSV_FILES = [
    Path(__file__).parent.parent / "people_count.csv",
    Path(__file__).parent.parent / "people_count_2025.csv",
]


def parse_row(timestamp_str: str, count_str: str) -> dict | None:
    """Parse a CSV row into a dict ready for Supabase. Returns None for bad rows."""
    count_str = count_str.strip()
    # "-" means the pool was closed; store as NULL
    people_count = int(count_str) if count_str.isdigit() else None

    try:
        # Format: "Tue Feb  4 19:52:06 2025"
        dt = datetime.strptime(timestamp_str.strip(), "%a %b %d %H:%M:%S %Y")
        dt = dt.replace(tzinfo=timezone.utc)
    except ValueError:
        log.warning("Skipping unrecognised timestamp: %r", timestamp_str)
        return None

    return {
        "pool_id": POOL_ID,
        "people_count": people_count,
        "recorded_at": dt.isoformat(),
    }


def import_file(client, path: Path) -> int:
    if not path.exists():
        log.warning("File not found, skipping: %s", path)
        return 0

    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for line in csv.reader(f):
            if len(line) != 2:
                continue
            row = parse_row(line[0], line[1])
            if row:
                rows.append(row)

    log.info("Parsed %d rows from %s", len(rows), path.name)

    # Insert in batches
    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        client.table("occupancy").insert(batch).execute()
        inserted += len(batch)
        log.info("  Inserted %d / %d", inserted, len(rows))

    return inserted


def main() -> None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")

    client = create_client(url, key)
    total = sum(import_file(client, p) for p in CSV_FILES)
    log.info("Done — imported %d rows total.", total)


if __name__ == "__main__":
    main()
