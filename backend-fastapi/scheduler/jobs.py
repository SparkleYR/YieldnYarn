"""APScheduler job functions (implementation_plan.md §5.4).

Kept separate from main.py for clarity/testability. main.py registers these
with an AsyncIOScheduler on app startup:

    scheduler.add_job(ingest_agmarknet_prices, "interval", hours=6)
    scheduler.add_job(expire_stale_listings, "cron", hour=2, minute=0)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError

from scheduler.agmarknet import (
    DATA_GOV_IN_SAMPLE_KEY,
    MAX_PAGES_PER_COMMODITY,
    MAX_TRACKED_COMMODITIES,
    PAGE_SIZE,
    SAMPLE_KEY_MAX_PAGES,
    SAMPLE_KEY_PAGE_SIZE,
    aggregate_records,
    fetch_commodity_records,
    unit_factor,
)

logger = logging.getLogger("scheduler.jobs")

# Listings sitting ACTIVE (unsold) longer than this are considered stale.
STALE_LISTING_DAYS = 30


def _tracked_commodities(session, vertical_id: int, extra: str) -> list[str]:
    """Commodities worth pricing: everything currently listed or wanted in
    the vertical, plus any configured extras — rather than a hardcoded list
    that silently goes stale as sellers list new produce."""
    from sqlalchemy import select

    from db import Listing, Requirement

    listed = session.execute(
        select(Listing.commodity_name)
        .where(
            Listing.vertical_id == vertical_id,
            Listing.status.in_(("ACTIVE", "PENDING_GRADING", "PENDING_VERIFICATION")),
        )
        .distinct()
    ).scalars()
    wanted = session.execute(
        select(Requirement.commodity)
        .where(Requirement.vertical_id == vertical_id, Requirement.status == "OPEN")
        .distinct()
    ).scalars()

    seen: dict[str, str] = {}
    for name in [*(c.strip() for c in extra.split(",")), *listed, *wanted]:
        if name and name.strip() and name.strip().lower() not in seen:
            seen[name.strip().lower()] = name.strip()
    return list(seen.values())[:MAX_TRACKED_COMMODITIES]


def _upsert_daily_price(session, vertical_id: int, daily, factor: Optional[float]) -> bool:
    """Insert or refresh one AGMARKNET price point. Returns True if inserted."""
    from sqlalchemy import select

    from db import PricePoint

    price = round(daily.price_per_quintal * (factor if factor is not None else 1.0), 2)
    raw_data = {
        "unit": "per vertical unit" if factor is not None else "quintal",
        "price_per_quintal": daily.price_per_quintal,
        "market_count": len(daily.markets),
        "markets": daily.markets,
    }
    existing = session.execute(
        select(PricePoint).where(
            PricePoint.vertical_id == vertical_id,
            PricePoint.commodity == daily.commodity,
            PricePoint.region == daily.state,
            PricePoint.source == "AGMARKNET",
            PricePoint.timestamp == daily.day,
        )
    ).scalars().first()
    if existing is not None:
        existing.price = price
        existing.raw_data = raw_data
        return False
    session.add(
        PricePoint(
            vertical_id=vertical_id,
            commodity=daily.commodity,
            region=daily.state,
            price=price,
            source="AGMARKNET",
            timestamp=daily.day,
            raw_data=raw_data,
        )
    )
    return True


def ingest_agmarknet_prices(client: Optional[httpx.Client] = None) -> dict:
    """Pull the latest Agmarknet mandi prices into `price_points` (every 6h).

    See scheduler/agmarknet.py for the data source and aggregation. Skips
    cleanly (logged, no error) when no API key is available or the
    agriculture vertical doesn't exist yet. Each commodity is fetched and
    committed independently, so one failing commodity (API error, bad
    payload) doesn't lose the others. Re-running is idempotent: a price point
    for the same commodity/state/day is updated in place, not duplicated.

    Returns a summary dict (also logged) for observability and tests.
    """
    from sqlalchemy import select

    from db import SessionLocal, Vertical, settings

    api_key = settings.AGMARKNET_API_KEY
    page_size, max_pages = PAGE_SIZE, MAX_PAGES_PER_COMMODITY
    if not api_key:
        if not settings.AGMARKNET_USE_SAMPLE_KEY:
            logger.info("[scheduler] ingest_agmarknet_prices skipped: AGMARKNET_API_KEY is not set")
            return {"skipped": "AGMARKNET_API_KEY is not set"}
        logger.info(
            "[scheduler] AGMARKNET_API_KEY not set; using data.gov.in's public sample key "
            "(10 records per request). Register a free key for full coverage."
        )
        api_key = DATA_GOV_IN_SAMPLE_KEY
        page_size, max_pages = SAMPLE_KEY_PAGE_SIZE, SAMPLE_KEY_MAX_PAGES

    summary: dict = {"commodities": [], "inserted": 0, "updated": 0, "failed": {}}
    session = SessionLocal()
    owns_client = client is None
    client = client or httpx.Client(timeout=30.0)
    try:
        try:
            vertical = session.execute(
                select(Vertical).where(Vertical.slug == settings.AGMARKNET_VERTICAL_SLUG)
            ).scalars().first()
            if vertical is None:
                logger.info(
                    "[scheduler] ingest_agmarknet_prices skipped: no '%s' vertical",
                    settings.AGMARKNET_VERTICAL_SLUG,
                )
                return {"skipped": f"no '{settings.AGMARKNET_VERTICAL_SLUG}' vertical"}
            commodities = _tracked_commodities(session, vertical.id, settings.AGMARKNET_COMMODITIES)
        except SQLAlchemyError as exc:
            logger.warning("[scheduler] ingest_agmarknet_prices skipped (DB not ready): %s", exc)
            return {"skipped": f"database not ready: {exc}"}

        factor = unit_factor(vertical.unit_of_measure)
        if factor is None:
            logger.warning(
                "[scheduler] unknown unit_of_measure %r for vertical %s; storing Agmarknet prices per quintal",
                vertical.unit_of_measure,
                vertical.slug,
            )

        for commodity in commodities:
            summary["commodities"].append(commodity)
            try:
                fetch = lambda name: fetch_commodity_records(  # noqa: E731
                    client,
                    base_url=settings.AGMARKNET_BASE_URL,
                    resource_id=settings.AGMARKNET_RESOURCE_ID,
                    api_key=api_key,
                    commodity=name,
                    page_size=page_size,
                    max_pages=max_pages,
                )
                records = fetch(commodity)
                # Agmarknet's filter is an exact match on its own Title Case
                # names ("Wheat"); sellers type whatever ("wheat").
                if not records and commodity.title() != commodity:
                    records = fetch(commodity.title())
                for daily in aggregate_records(commodity, records):
                    if _upsert_daily_price(session, vertical.id, daily, factor):
                        summary["inserted"] += 1
                    else:
                        summary["updated"] += 1
                session.commit()
            except (httpx.HTTPError, ValueError) as exc:
                session.rollback()
                summary["failed"][commodity] = str(exc)
                logger.warning("[scheduler] Agmarknet fetch failed for %s: %s", commodity, exc)
            except SQLAlchemyError as exc:
                session.rollback()
                summary["failed"][commodity] = str(exc)
                logger.warning("[scheduler] Agmarknet upsert failed for %s: %s", commodity, exc)
    finally:
        session.close()
        if owns_client:
            client.close()

    logger.info(
        "[scheduler] ingest_agmarknet_prices: %d commodities, %d inserted, %d updated, %d failed",
        len(summary["commodities"]),
        summary["inserted"],
        summary["updated"],
        len(summary["failed"]),
    )
    return summary


def expire_stale_listings() -> None:
    """Mark ACTIVE listings older than STALE_LISTING_DAYS (by updated_at) as EXPIRED.

    Runs daily at 02:00. Uses a direct SQL UPDATE for efficiency rather than
    loading/saving each row via the ORM.
    """
    # Imported lazily to avoid a hard import-time dependency between
    # scheduler and db (keeps this module cheap to import in isolation/tests).
    from db import Listing, SessionLocal

    cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_LISTING_DAYS)
    session = SessionLocal()
    try:
        result = session.execute(
            update(Listing).where(Listing.status == "ACTIVE", Listing.updated_at < cutoff).values(status="EXPIRED")
        )
        session.commit()
        logger.info(
            "[scheduler] expire_stale_listings: marked %s listing(s) EXPIRED (older than %sd)",
            result.rowcount,
            STALE_LISTING_DAYS,
        )
    except SQLAlchemyError as exc:
        session.rollback()
        logger.warning("[scheduler] expire_stale_listings skipped/failed (DB likely not migrated yet): %s", exc)
    finally:
        session.close()
