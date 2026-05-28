"""
Shared pool configuration used by both the scraper and the prediction script.
Add new pools here; everything else picks them up automatically.
"""
from dataclasses import dataclass


@dataclass
class PoolConfig:
    pool_id: str
    url: str
    element_id: str
    open_start: int   # Zürich local hour, inclusive  (06 → pool opens at 06:00)
    open_end: int     # Zürich local hour, exclusive  (22 → pool closes at 22:00)
    label: str


POOLS: list[PoolConfig] = [
    PoolConfig(
        pool_id="hallenbad_city",
        url="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/schwimmbad-und-hallenbad/hallenbad-city.html",
        element_id="SSD-4_visitornumber",
        open_start=6,
        open_end=22,
        label="Hallenbad City",
    ),
    PoolConfig(
        pool_id="mythenquai",
        url="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/sommerbaeder/mythenquai.html",
        element_id="seb6946_visitornumber",
        open_start=7,
        open_end=21,
        label="Strandbad Mythenquai",
    ),
    PoolConfig(
        pool_id="enge",
        url="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/sommerbaeder/enge.html",
        element_id="BADI-1_visitornumber",
        open_start=9,
        open_end=20,
        label="Seebad Enge",
    ),
    PoolConfig(
        pool_id="oberer_letten",
        url="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/sommerbaeder/oberer-letten.html",
        element_id="flb6939_visitornumber",
        open_start=9,
        open_end=21,
        label="Flussbad Oberer Letten",
    ),
    PoolConfig(
        pool_id="unterer_letten",
        url="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-und-badeanlagen/sommerbaeder/unterer-letten.html",
        element_id="flb8803_visitornumber",
        open_start=9,
        open_end=21,
        label="Flussbad Unterer Letten",
    ),
]
