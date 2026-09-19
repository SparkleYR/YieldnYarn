"""Shared DB fixture helpers for the integration test suites (test_grading_router.py,
test_pricing_router.py, test_scheduler.py) — see conftest.py's `db_session`
docstring for the isolation tradeoff these tests accept (live local Postgres,
no separate test database)."""
from datetime import datetime, timezone

from conftest import delete_user, make_user
from db import GradingResult, GradingSchema, Listing, Order, OrderAllocation, PricePoint, PricingRule, Requirement, Vertical


def make_vertical(db_session, slug: str, attributes: list | None = None, rules: dict | None = None) -> int:
    vertical = Vertical(name=slug, slug=slug, unit_of_measure="kg", is_active=True, created_at=datetime.now(timezone.utc))
    db_session.add(vertical)
    db_session.commit()
    db_session.refresh(vertical)
    db_session.add(
        GradingSchema(
            vertical_id=vertical.id,
            attributes=attributes or [],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    if rules is not None:
        db_session.add(
            PricingRule(
                vertical_id=vertical.id, rules=rules, created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc)
            )
        )
    db_session.commit()
    return vertical.id


def make_listing(db_session, seller_id: int, vertical_id: int, **overrides) -> int:
    defaults = dict(
        seller_id=seller_id,
        vertical_id=vertical_id,
        commodity_name="Pytest Wheat",
        quantity=100,
        unit="kg",
        status="ACTIVE",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    listing = Listing(**defaults)
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)
    return listing.id


def make_price_point(db_session, vertical_id: int, **overrides) -> int:
    defaults = dict(
        vertical_id=vertical_id,
        commodity="Pytest Wheat",
        region="Pytest Region",
        price=2000.0,
        source="ADMIN_ENTERED",
        timestamp=datetime.now(timezone.utc),
        raw_data={},
    )
    defaults.update(overrides)
    price_point = PricePoint(**defaults)
    db_session.add(price_point)
    db_session.commit()
    db_session.refresh(price_point)
    return price_point.id


def make_requirement(db_session, buyer_id: int, vertical_id: int, **overrides) -> int:
    defaults = dict(
        buyer_id=buyer_id,
        vertical_id=vertical_id,
        commodity="Pytest Wheat",
        quantity=100,
        min_grade="",
        region="",
        search_radius_km=100.0,
        status="OPEN",
        created_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    requirement = Requirement(**defaults)
    db_session.add(requirement)
    db_session.commit()
    db_session.refresh(requirement)
    return requirement.id


def cleanup(
    db_session,
    *,
    listing_ids=(),
    vertical_ids=(),
    seller_ids=(),
    price_point_ids=(),
    requirement_ids=(),
    order_ids=(),
    buyer_ids=(),
) -> None:
    """Delete in dependency order, all within one commit (FKs here are
    DEFERRABLE INITIALLY DEFERRED, so intra-transaction order doesn't
    strictly matter, but this stays close to real dependency order anyway)."""
    if order_ids:
        db_session.query(OrderAllocation).filter(OrderAllocation.order_id.in_(order_ids)).delete(synchronize_session=False)
        db_session.query(Order).filter(Order.id.in_(order_ids)).delete(synchronize_session=False)
    if requirement_ids:
        db_session.query(Order).filter(Order.requirement_id.in_(requirement_ids)).delete(synchronize_session=False)
        db_session.query(Requirement).filter(Requirement.id.in_(requirement_ids)).delete(synchronize_session=False)
    if listing_ids:
        db_session.query(OrderAllocation).filter(OrderAllocation.listing_id.in_(listing_ids)).delete(synchronize_session=False)
        db_session.query(GradingResult).filter(GradingResult.listing_id.in_(listing_ids)).delete(synchronize_session=False)
        db_session.query(Listing).filter(Listing.id.in_(listing_ids)).delete(synchronize_session=False)
    if price_point_ids:
        db_session.query(PricePoint).filter(PricePoint.id.in_(price_point_ids)).delete(synchronize_session=False)
    if vertical_ids:
        db_session.query(GradingSchema).filter(GradingSchema.vertical_id.in_(vertical_ids)).delete(synchronize_session=False)
        db_session.query(PricingRule).filter(PricingRule.vertical_id.in_(vertical_ids)).delete(synchronize_session=False)
        db_session.query(Vertical).filter(Vertical.id.in_(vertical_ids)).delete(synchronize_session=False)
    db_session.commit()
    for seller_id in {*seller_ids, *buyer_ids}:
        delete_user(db_session, seller_id)


__all__ = ["make_user", "make_vertical", "make_listing", "make_price_point", "make_requirement", "cleanup"]
