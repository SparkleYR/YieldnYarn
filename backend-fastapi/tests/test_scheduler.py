"""Tests for scheduler/jobs.py. `expire_stale_listings` needs the live local
Postgres (see conftest.py's `db_session` docstring); `ingest_agmarknet_prices`
is a pure stub and needs nothing."""
from datetime import datetime, timedelta, timezone

from db import Listing
from scheduler.jobs import STALE_LISTING_DAYS, expire_stale_listings, ingest_agmarknet_prices
from tests.db_fixtures import cleanup, make_listing, make_user, make_vertical


def test_ingest_agmarknet_prices_runs_without_error(caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="scheduler.jobs"):
        ingest_agmarknet_prices()  # should not raise — it's a stub, see its own docstring

    assert any("stub run" in record.message for record in caplog.records)


def test_expire_stale_listings_marks_old_active_listings_expired(db_session):
    seller_id = make_user(db_session, "seller1@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-scheduler-a")
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_LISTING_DAYS + 1)
    fresh_time = datetime.now(timezone.utc)

    old_listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Stale", updated_at=stale_cutoff)
    fresh_listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Fresh", updated_at=fresh_time)
    try:
        expire_stale_listings()

        db_session.expire_all()
        old_listing = db_session.get(Listing, old_listing_id)
        fresh_listing = db_session.get(Listing, fresh_listing_id)
        assert old_listing.status == "EXPIRED"
        assert fresh_listing.status == "ACTIVE"
    finally:
        cleanup(db_session, listing_ids=[old_listing_id, fresh_listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])


def test_expire_stale_listings_leaves_non_active_listings_alone(db_session):
    seller_id = make_user(db_session, "seller2@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-scheduler-b")
    stale_cutoff = datetime.now(timezone.utc) - timedelta(days=STALE_LISTING_DAYS + 1)

    sold_listing_id = make_listing(
        db_session, seller_id, vertical_id, commodity_name="Pytest Sold", status="SOLD", updated_at=stale_cutoff
    )
    try:
        expire_stale_listings()

        db_session.expire_all()
        sold_listing = db_session.get(Listing, sold_listing_id)
        assert sold_listing.status == "SOLD"  # untouched — only ACTIVE listings are ever expired
    finally:
        cleanup(db_session, listing_ids=[sold_listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])
