"""Integration tests for POST /compute/matching/{find,allocate}.

Requires a running local Postgres (DATABASE_URL) — see conftest.py's
`db_session` docstring for the isolation tradeoff these accept.

Before this pass, this router had zero test coverage despite being the only
thing that ever turns a buyer's `Requirement` into a real `Order` — nothing
in Django calls it, so posting a requirement did nothing until the Django
side (`orders/views.py:RequirementViewSet.trigger_match`) was wired to call
it explicitly.
"""
from db import Listing, Order, Requirement
from tests.db_fixtures import cleanup, make_listing, make_requirement, make_user, make_vertical


def test_find_matches_is_a_dry_run_and_does_not_persist_anything(client, db_session):
    buyer_id = make_user(db_session, "buyer1@pytest-fastapi.test", "BUYER")
    seller_id = make_user(db_session, "seller1@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-matching-a")
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=100, price_final=2000)
    requirement_id = make_requirement(db_session, buyer_id, vertical_id, commodity="Pytest Wheat", quantity=40)
    try:
        response = client.post("/compute/matching/find", json={"requirement_id": requirement_id})

        assert response.status_code == 200
        body = response.json()
        assert body["fully_fulfilled"] is True
        assert body["matches"] == [{"listing_id": listing_id, "allocated_quantity": 40.0, "unit_price": 2000.0}]
        assert db_session.query(Order).filter(Order.requirement_id == requirement_id).count() == 0
        db_session.expire_all()
        assert db_session.get(Listing, listing_id).quantity == 100  # untouched — dry run only
    finally:
        cleanup(db_session, requirement_ids=[requirement_id], listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id], buyer_ids=[buyer_id])


def test_find_matches_404_for_unknown_requirement(client):
    response = client.post("/compute/matching/find", json={"requirement_id": 999999999})
    assert response.status_code == 404


def test_allocate_creates_order_and_decrements_listing_quantity(client, db_session):
    # Regression check: this endpoint used to create Order/OrderAllocation
    # rows without ever touching the source Listing's quantity — the same
    # stock could be "matched" again by a later requirement indefinitely.
    buyer_id = make_user(db_session, "buyer2@pytest-fastapi.test", "BUYER")
    seller_id = make_user(db_session, "seller2@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-matching-b")
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=100, price_final=2000)
    requirement_id = make_requirement(db_session, buyer_id, vertical_id, commodity="Pytest Wheat", quantity=40)
    order_id = None
    try:
        response = client.post("/compute/matching/allocate", json={"requirement_id": requirement_id})

        assert response.status_code == 200
        body = response.json()
        order_id = body["order_id"]
        assert body["fully_fulfilled"] is True
        assert body["total_price"] == 80000.0

        order = db_session.get(Order, order_id)
        assert order.buyer_id == buyer_id
        assert order.requirement_id == requirement_id
        assert order.status == "PENDING"

        db_session.expire_all()
        listing = db_session.get(Listing, listing_id)
        assert listing.quantity == 60  # 100 - 40
        assert listing.status == "ACTIVE"  # not exhausted

        requirement = db_session.get(Requirement, requirement_id)
        assert requirement.status == "MATCHED"
    finally:
        cleanup(
            db_session,
            order_ids=[order_id] if order_id else [],
            requirement_ids=[requirement_id],
            listing_ids=[listing_id],
            vertical_ids=[vertical_id],
            seller_ids=[seller_id],
            buyer_ids=[buyer_id],
        )


def test_allocate_for_the_full_listing_quantity_marks_it_sold(client, db_session):
    buyer_id = make_user(db_session, "buyer3@pytest-fastapi.test", "BUYER")
    seller_id = make_user(db_session, "seller3@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-matching-c")
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=40, price_final=2000)
    requirement_id = make_requirement(db_session, buyer_id, vertical_id, commodity="Pytest Wheat", quantity=40)
    order_id = None
    try:
        response = client.post("/compute/matching/allocate", json={"requirement_id": requirement_id})
        order_id = response.json()["order_id"]

        db_session.expire_all()
        listing = db_session.get(Listing, listing_id)
        assert listing.quantity == 0
        assert listing.status == "SOLD"
    finally:
        cleanup(
            db_session,
            order_ids=[order_id] if order_id else [],
            requirement_ids=[requirement_id],
            listing_ids=[listing_id],
            vertical_ids=[vertical_id],
            seller_ids=[seller_id],
            buyer_ids=[buyer_id],
        )


def test_allocate_partial_leaves_requirement_open_and_reports_shortfall(client, db_session):
    buyer_id = make_user(db_session, "buyer4@pytest-fastapi.test", "BUYER")
    seller_id = make_user(db_session, "seller4@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-matching-d")
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=25, price_final=2000)
    requirement_id = make_requirement(db_session, buyer_id, vertical_id, commodity="Pytest Wheat", quantity=100)
    order_id = None
    try:
        response = client.post("/compute/matching/allocate", json={"requirement_id": requirement_id})

        assert response.status_code == 200
        body = response.json()
        order_id = body["order_id"]
        assert body["fully_fulfilled"] is False
        assert body["shortfall"] == 75

        requirement = db_session.get(Requirement, requirement_id)
        assert requirement.status == "OPEN"  # not fully satisfied yet
    finally:
        cleanup(
            db_session,
            order_ids=[order_id] if order_id else [],
            requirement_ids=[requirement_id],
            listing_ids=[listing_id],
            vertical_ids=[vertical_id],
            seller_ids=[seller_id],
            buyer_ids=[buyer_id],
        )


def test_allocate_404_for_unknown_requirement(client):
    response = client.post("/compute/matching/allocate", json={"requirement_id": 999999999})
    assert response.status_code == 404


def test_allocate_409_when_nothing_matches(client, db_session):
    buyer_id = make_user(db_session, "buyer5@pytest-fastapi.test", "BUYER")
    vertical_id = make_vertical(db_session, "pytest-matching-e")
    requirement_id = make_requirement(db_session, buyer_id, vertical_id, commodity="Nonexistent Grain", quantity=10)
    try:
        response = client.post("/compute/matching/allocate", json={"requirement_id": requirement_id})
        assert response.status_code == 409
    finally:
        cleanup(db_session, requirement_ids=[requirement_id], vertical_ids=[vertical_id], buyer_ids=[buyer_id])


def test_allocate_respects_min_grade_filter(client, db_session):
    buyer_id = make_user(db_session, "buyer6@pytest-fastapi.test", "BUYER")
    seller_id = make_user(db_session, "seller6@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(
        db_session, "pytest-matching-f", attributes=[{"name": "purity", "weight": 1.0, "gradeable_by_ml": True}]
    )
    # No grading result -> derive_grade returns None -> excluded by a real min_grade filter.
    listing_id = make_listing(db_session, seller_id, vertical_id, commodity_name="Pytest Wheat", quantity=100, price_final=2000)
    requirement_id = make_requirement(
        db_session, buyer_id, vertical_id, commodity="Pytest Wheat", quantity=40, min_grade="Grade A"
    )
    try:
        response = client.post("/compute/matching/allocate", json={"requirement_id": requirement_id})
        assert response.status_code == 409  # ungraded listing doesn't satisfy min_grade
    finally:
        cleanup(
            db_session,
            requirement_ids=[requirement_id],
            listing_ids=[listing_id],
            vertical_ids=[vertical_id],
            seller_ids=[seller_id],
            buyer_ids=[buyer_id],
        )
