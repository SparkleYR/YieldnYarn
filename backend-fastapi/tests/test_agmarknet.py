"""Agmarknet ingestion: pure parsing/aggregation, plus the scheduler job end
to end against the live local Postgres with the data.gov.in API replaced by
an httpx.MockTransport."""
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select

import db as db_module
from db import PricePoint
from scheduler.agmarknet import aggregate_records, fetch_commodity_records, unit_factor
from scheduler.jobs import ingest_agmarknet_prices
from tests.db_fixtures import cleanup, make_listing, make_user, make_vertical

WHEAT_RECORDS = [
    {"state": "Rajasthan", "district": "Jaipur", "market": "Jaipur (Grain)", "commodity": "Wheat",
     "variety": "Other", "grade": "FAQ", "arrival_date": "27/09/2026",
     "min_price": "2350", "max_price": "2500", "modal_price": "2400"},
    {"state": "Rajasthan", "district": "Kota", "market": "Kota", "commodity": "Wheat",
     "variety": "Lokwan", "grade": "FAQ", "arrival_date": "27/09/2026",
     "min_price": "2400", "max_price": "2550", "modal_price": "2500"},
    {"state": "Madhya Pradesh", "district": "Indore", "market": "Indore", "commodity": "Wheat",
     "variety": "Sharbati", "grade": "FAQ", "arrival_date": "27/09/2026",
     "min_price": "2600", "max_price": "2900", "modal_price": "2800"},
]


# --- pure helpers --------------------------------------------------------


def test_aggregate_takes_the_mean_modal_price_per_state_and_day():
    daily = aggregate_records("Wheat", WHEAT_RECORDS)

    by_state = {d.state: d for d in daily}
    assert by_state["Rajasthan"].price_per_quintal == 2450.0
    assert len(by_state["Rajasthan"].markets) == 2
    assert by_state["Madhya Pradesh"].price_per_quintal == 2800.0
    assert by_state["Rajasthan"].day == datetime(2026, 9, 27, tzinfo=timezone.utc)


def test_aggregate_handles_capitalized_keys_and_skips_unusable_records():
    records = [
        {"State": "Punjab", "Arrival_Date": "26/09/2026", "Modal_Price": "2,300", "Market": "Khanna"},
        {"state": "Punjab", "arrival_date": "26/09/2026", "modal_price": "0"},  # zero price
        {"state": "", "arrival_date": "26/09/2026", "modal_price": "2000"},  # no state
        {"state": "Punjab", "arrival_date": "not a date", "modal_price": "2000"},
    ]

    daily = aggregate_records("Wheat", records)

    assert len(daily) == 1
    assert daily[0].price_per_quintal == 2300.0
    assert daily[0].markets[0]["market"] == "Khanna"


@pytest.mark.parametrize(
    "unit,expected", [("quintal", 1.0), ("kg", 0.01), ("Tonne", 10.0), ("bale", None), (None, None)]
)
def test_unit_factor(unit, expected):
    assert unit_factor(unit) == expected


def test_fetch_follows_offset_pagination():
    seen_offsets = []

    def handler(request: httpx.Request) -> httpx.Response:
        offset = int(request.url.params["offset"])
        seen_offsets.append(offset)
        assert request.url.params["filters[commodity]"] == "Wheat"
        assert request.url.params["api-key"] == "k"
        page = [{"modal_price": "1"}] * (500 if offset == 0 else 3)
        return httpx.Response(200, json={"total": 503, "records": page})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        records = fetch_commodity_records(
            client, base_url="https://api.test/resource", resource_id="rid", api_key="k", commodity="Wheat"
        )

    assert len(records) == 503
    assert seen_offsets == [0, 500]


# --- the scheduler job ---------------------------------------------------


@pytest.fixture
def agmarknet_settings(monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_API_KEY", "test-key")
    monkeypatch.setattr(db_module.settings, "AGMARKNET_VERTICAL_SLUG", "pytest-agmarknet")
    monkeypatch.setattr(db_module.settings, "AGMARKNET_COMMODITIES", "")
    return db_module.settings


def _mock_api(records_by_commodity, calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        commodity = request.url.params["filters[commodity]"]
        if calls is not None:
            calls.append(commodity)
        if commodity == "Broken":
            return httpx.Response(500, text="upstream error")
        records = records_by_commodity.get(commodity, [])
        return httpx.Response(200, json={"total": len(records), "records": records})

    return httpx.Client(transport=httpx.MockTransport(handler))


def _price_points(db_session, vertical_id):
    db_session.expire_all()
    return db_session.execute(
        select(PricePoint).where(PricePoint.vertical_id == vertical_id).order_by(PricePoint.region)
    ).scalars().all()


def _delete_price_points(db_session, vertical_id):
    db_session.query(PricePoint).filter(PricePoint.vertical_id == vertical_id).delete(synchronize_session=False)
    db_session.commit()


def test_skips_without_an_api_key_when_the_sample_key_is_disabled(monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_API_KEY", "")
    monkeypatch.setattr(db_module.settings, "AGMARKNET_USE_SAMPLE_KEY", False)
    assert "skipped" in ingest_agmarknet_prices()


def test_falls_back_to_the_public_sample_key_with_its_10_record_pages(db_session, agmarknet_settings, monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_API_KEY", "")
    monkeypatch.setattr(db_module.settings, "AGMARKNET_USE_SAMPLE_KEY", True)
    monkeypatch.setattr(db_module.settings, "AGMARKNET_COMMODITIES", "Wheat")
    vertical_id = make_vertical(db_session, "pytest-agmarknet")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.url.params["api-key"], request.url.params["limit"]))
        return httpx.Response(200, json={"total": 3, "records": WHEAT_RECORDS})

    try:
        with httpx.Client(transport=httpx.MockTransport(handler)) as client:
            summary = ingest_agmarknet_prices(client=client)
        assert seen[0] == ("579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b", "10")
        assert summary["inserted"] == 2
    finally:
        _delete_price_points(db_session, vertical_id)
        cleanup(db_session, vertical_ids=[vertical_id])


def test_skips_when_the_vertical_does_not_exist(agmarknet_settings):
    with _mock_api({}) as client:
        assert "skipped" in ingest_agmarknet_prices(client=client)


def test_ingests_listed_commodities_as_state_level_price_points(db_session, agmarknet_settings):
    seller_id = make_user(db_session, "agmarknet-seller@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-agmarknet")
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="wheat")  # lower-case on purpose
    calls = []
    try:
        with _mock_api({"Wheat": WHEAT_RECORDS}, calls) as client:
            summary = ingest_agmarknet_prices(client=client)

        # "wheat" found nothing, so it retried with Agmarknet's Title Case name.
        assert calls == ["wheat", "Wheat"]
        assert summary["inserted"] == 2
        points = _price_points(db_session, vertical_id)
        assert [p.region for p in points] == ["Madhya Pradesh", "Rajasthan"]
        rajasthan = points[1]
        assert rajasthan.source == "AGMARKNET"
        assert rajasthan.commodity == "wheat"
        # make_vertical uses unit_of_measure="kg": ₹2450/quintal -> ₹24.50/kg
        assert rajasthan.price == 24.5
        assert rajasthan.raw_data["price_per_quintal"] == 2450.0
        assert rajasthan.raw_data["market_count"] == 2
    finally:
        _delete_price_points(db_session, vertical_id)
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])


def test_rerunning_updates_instead_of_duplicating(db_session, agmarknet_settings, monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_COMMODITIES", "Wheat")
    vertical_id = make_vertical(db_session, "pytest-agmarknet")
    try:
        with _mock_api({"Wheat": WHEAT_RECORDS}) as client:
            ingest_agmarknet_prices(client=client)
        revised = [dict(r, modal_price="2600") if r["state"] == "Madhya Pradesh" else r for r in WHEAT_RECORDS]
        with _mock_api({"Wheat": revised}) as client:
            summary = ingest_agmarknet_prices(client=client)

        assert summary["inserted"] == 0
        assert summary["updated"] == 2
        points = _price_points(db_session, vertical_id)
        assert len(points) == 2
        assert points[0].price == 26.0
    finally:
        _delete_price_points(db_session, vertical_id)
        cleanup(db_session, vertical_ids=[vertical_id])


def test_one_failing_commodity_does_not_lose_the_others(db_session, agmarknet_settings, monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_COMMODITIES", "Broken,Wheat")
    vertical_id = make_vertical(db_session, "pytest-agmarknet")
    try:
        with _mock_api({"Wheat": WHEAT_RECORDS}) as client:
            summary = ingest_agmarknet_prices(client=client)

        assert "Broken" in summary["failed"]
        assert summary["inserted"] == 2
        assert len(_price_points(db_session, vertical_id)) == 2
    finally:
        _delete_price_points(db_session, vertical_id)
        cleanup(db_session, vertical_ids=[vertical_id])


def test_ingested_prices_feed_the_pricing_api(client, db_session, agmarknet_settings, monkeypatch):
    monkeypatch.setattr(db_module.settings, "AGMARKNET_COMMODITIES", "Wheat")
    vertical_id = make_vertical(db_session, "pytest-agmarknet")
    try:
        with _mock_api({"Wheat": WHEAT_RECORDS}) as api:
            ingest_agmarknet_prices(client=api)

        response = client.get(
            "/compute/pricing/base",
            params={"vertical": "pytest-agmarknet", "commodity": "Wheat", "region": "Rajasthan"},
        )

        assert response.status_code == 200
        assert response.json()["base_price"] == 24.5
    finally:
        _delete_price_points(db_session, vertical_id)
        cleanup(db_session, vertical_ids=[vertical_id])
