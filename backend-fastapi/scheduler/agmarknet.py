"""Agmarknet mandi-price ingestion (implementation_plan.md §5.4).

Agmarknet's daily market prices are published through the Government of
India's Open Government Data platform (api.data.gov.in) as the resource
"Current Daily Price of Various Commodities from Various Markets (Mandi)".
Each record is one market's prices for one commodity/variety on one day:

    {"state": "Rajasthan", "district": "Jaipur", "market": "Jaipur (Grain)",
     "commodity": "Wheat", "variety": "Other", "grade": "FAQ",
     "arrival_date": "27/09/2026", "min_price": "2350", "max_price": "2500",
     "modal_price": "2425"}

Prices are ₹ per quintal. We collapse a day's markets into one price point
per (commodity, state, day) — the mean of the markets' modal prices — since
`price_points.region` is a free-text label the rest of the system matches at
state granularity (e.g. a buyer's requirement region "Rajasthan"), and a row
per mandi would bury the pricing lookups in near-duplicates. The individual
market records are kept in `raw_data` for traceability.

Everything network-facing takes an injectable `httpx.Client` so the tests can
drive it with `httpx.MockTransport` instead of the real API.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Iterable, Optional

import httpx

logger = logging.getLogger("scheduler.agmarknet")

PAGE_SIZE = 500
MAX_PAGES_PER_COMMODITY = 10
MAX_TRACKED_COMMODITIES = 50

# Agmarknet reports ₹/quintal; multiply by this to get ₹ per vertical unit.
UNIT_FACTORS_FROM_QUINTAL = {
    "quintal": 1.0,
    "qtl": 1.0,
    "kg": 0.01,
    "kgs": 0.01,
    "kilogram": 0.01,
    "tonne": 10.0,
    "ton": 10.0,
    "mt": 10.0,
}


@dataclass
class DailyStatePrice:
    commodity: str
    state: str
    day: datetime
    price_per_quintal: float
    markets: list[dict] = field(default_factory=list)


def _normalize_keys(record: dict) -> dict:
    # Some data.gov.in Agmarknet resources capitalize field names
    # ("Modal_Price", "State"); normalize so one parser handles both.
    return {str(k).strip().lower(): v for k, v in record.items()}


def _parse_price(value) -> Optional[float]:
    try:
        price = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return price if price > 0 else None


def _parse_arrival_date(value) -> Optional[datetime]:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def aggregate_records(commodity: str, records: Iterable[dict]) -> list[DailyStatePrice]:
    """Collapse raw market records into one mean modal price per state/day.

    Records with an unparseable date/state or a missing/zero modal price are
    skipped (the feed does contain those).
    """
    grouped: dict[tuple[str, datetime], list[dict]] = defaultdict(list)
    for raw in records:
        record = _normalize_keys(raw)
        state = str(record.get("state") or "").strip()
        day = _parse_arrival_date(record.get("arrival_date"))
        price = _parse_price(record.get("modal_price"))
        if not state or day is None or price is None:
            continue
        grouped[(state, day)].append(
            {
                "market": record.get("market", ""),
                "district": record.get("district", ""),
                "variety": record.get("variety", ""),
                "grade": record.get("grade", ""),
                "min_price": _parse_price(record.get("min_price")),
                "max_price": _parse_price(record.get("max_price")),
                "modal_price": price,
            }
        )

    return [
        DailyStatePrice(
            commodity=commodity,
            state=state,
            day=day,
            price_per_quintal=round(mean(m["modal_price"] for m in markets), 2),
            markets=markets,
        )
        for (state, day), markets in sorted(grouped.items(), key=lambda item: (item[0][1], item[0][0]))
    ]


def fetch_commodity_records(
    client: httpx.Client,
    *,
    base_url: str,
    resource_id: str,
    api_key: str,
    commodity: str,
) -> list[dict]:
    """All records for one commodity, following offset pagination."""
    records: list[dict] = []
    for page in range(MAX_PAGES_PER_COMMODITY):
        response = client.get(
            f"{base_url.rstrip('/')}/{resource_id}",
            params={
                "api-key": api_key,
                "format": "json",
                "limit": PAGE_SIZE,
                "offset": page * PAGE_SIZE,
                "filters[commodity]": commodity,
            },
        )
        response.raise_for_status()
        body = response.json()
        batch = body.get("records") or []
        records.extend(batch)
        total = int(body.get("total") or 0)
        if len(batch) < PAGE_SIZE or (total and len(records) >= total):
            break
    return records


def unit_factor(unit_of_measure: Optional[str]) -> Optional[float]:
    return UNIT_FACTORS_FROM_QUINTAL.get((unit_of_measure or "").strip().lower())
