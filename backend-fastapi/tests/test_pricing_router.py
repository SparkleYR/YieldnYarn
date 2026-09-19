"""Integration tests for GET /compute/pricing/{base,adjusted,estimate,trends}.

Requires a running local Postgres (DATABASE_URL) — see conftest.py's
`db_session` docstring for the isolation tradeoff these accept.
"""
from datetime import datetime, timedelta, timezone

from db import GradingResult
from tests.db_fixtures import cleanup, make_listing, make_price_point, make_user, make_vertical


def test_base_price_returns_latest_matching_point(client, db_session):
    vertical_id = make_vertical(db_session, "pytest-pricing-a")
    old_id = make_price_point(
        db_session, vertical_id, commodity="Wheat", region="Jaipur",
        price=2000.0, timestamp=datetime.now(timezone.utc) - timedelta(days=2),
    )
    new_id = make_price_point(
        db_session, vertical_id, commodity="Wheat", region="Jaipur",
        price=2100.0, timestamp=datetime.now(timezone.utc),
    )
    try:
        response = client.get(
            "/compute/pricing/base", params={"vertical": "pytest-pricing-a", "commodity": "Wheat", "region": "Jaipur"}
        )

        assert response.status_code == 200
        assert response.json()["base_price"] == 2100.0  # the newer of the two
    finally:
        cleanup(db_session, vertical_ids=[vertical_id], price_point_ids=[old_id, new_id])


def test_base_price_404_when_no_data(client, db_session):
    vertical_id = make_vertical(db_session, "pytest-pricing-b")
    try:
        response = client.get(
            "/compute/pricing/base", params={"vertical": "pytest-pricing-b", "commodity": "Nonexistent"}
        )
        assert response.status_code == 404
    finally:
        cleanup(db_session, vertical_ids=[vertical_id])


def test_base_price_404_for_unknown_vertical(client):
    response = client.get("/compute/pricing/base", params={"vertical": "no-such-vertical", "commodity": "Wheat"})
    assert response.status_code == 404


def test_adjusted_price_applies_grade_multiplier(client, db_session):
    seller_id = make_user(db_session, "seller1@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(
        db_session,
        "pytest-pricing-c",
        attributes=[{"name": "purity", "weight": 1.0, "gradeable_by_ml": True}],
        rules={"grade_adjustment_table": [{"grade": "Grade A", "multiplier": 1.1}]},
    )
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=10)
    price_point_id = make_price_point(db_session, vertical_id, commodity="Pytest Wheat", price=1000.0)
    db_session.add(
        GradingResult(listing_id=listing_id, source="AI", confidence_score=0.95, attribute_scores={"purity": 0.95}, created_at=datetime.now(timezone.utc))
    )
    db_session.commit()
    try:
        response = client.get("/compute/pricing/adjusted", params={"listing_id": listing_id})

        assert response.status_code == 200
        body = response.json()
        assert body["grade_used"] == "Grade A"
        assert body["base_price"] == 1000.0
        assert body["adjusted_price"] == 1100.0  # 1000 * 1.1, no quantity tiers configured
        assert body["has_grading_result"] is True
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id], price_point_ids=[price_point_id])


def test_adjusted_price_no_multiplier_when_ungraded(client, db_session):
    seller_id = make_user(db_session, "seller2@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(
        db_session, "pytest-pricing-d", rules={"grade_adjustment_table": [{"grade": "Grade A", "multiplier": 1.5}]}
    )
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat")
    price_point_id = make_price_point(db_session, vertical_id, commodity="Pytest Wheat", price=1000.0)
    try:
        response = client.get("/compute/pricing/adjusted", params={"listing_id": listing_id})

        assert response.status_code == 200
        body = response.json()
        assert body["grade_used"] is None
        assert body["adjusted_price"] == 1000.0  # multiplier 1.0 — no grading result at all
        assert body["has_grading_result"] is False
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id], price_point_ids=[price_point_id])


def test_adjusted_price_404_for_missing_listing(client):
    response = client.get("/compute/pricing/adjusted", params={"listing_id": 999999999})
    assert response.status_code == 404


def test_estimate_applies_quantity_tier(client, db_session):
    vertical_id = make_vertical(
        db_session, "pytest-pricing-e", rules={"quantity_tier_table": [{"min_quantity": 50, "multiplier": 0.9}]}
    )
    price_point_id = make_price_point(db_session, vertical_id, commodity="Pytest Wheat", price=1000.0)
    try:
        response = client.get(
            "/compute/pricing/estimate",
            params={"vertical": "pytest-pricing-e", "commodity": "Pytest Wheat", "quantity": 60},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["unit_price"] == 900.0  # 1000 * 0.9 (60 >= 50 tier)
        assert body["estimated_total"] == 54000.0
    finally:
        cleanup(db_session, vertical_ids=[vertical_id], price_point_ids=[price_point_id])


def test_estimate_404_when_no_price_data(client, db_session):
    vertical_id = make_vertical(db_session, "pytest-pricing-f")
    try:
        response = client.get(
            "/compute/pricing/estimate",
            params={"vertical": "pytest-pricing-f", "commodity": "Nonexistent", "quantity": 10},
        )
        assert response.status_code == 404
    finally:
        cleanup(db_session, vertical_ids=[vertical_id])


def test_trends_returns_points_within_window(client, db_session):
    vertical_id = make_vertical(db_session, "pytest-pricing-g")
    in_window = make_price_point(
        db_session, vertical_id, commodity="Pytest Wheat", price=1000.0, timestamp=datetime.now(timezone.utc) - timedelta(days=5)
    )
    out_of_window = make_price_point(
        db_session, vertical_id, commodity="Pytest Wheat", price=500.0, timestamp=datetime.now(timezone.utc) - timedelta(days=60)
    )
    try:
        response = client.get(
            "/compute/pricing/trends",
            params={"vertical": "pytest-pricing-g", "commodity": "Pytest Wheat", "days": 30},
        )

        assert response.status_code == 200
        body = response.json()
        assert len(body["points"]) == 1
        assert body["points"][0]["price"] == 1000.0
    finally:
        cleanup(db_session, vertical_ids=[vertical_id], price_point_ids=[in_window, out_of_window])
