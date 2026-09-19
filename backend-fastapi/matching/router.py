"""Matching endpoints (implementation_plan.md §5.2, §5.3).

    POST /compute/matching/find      {requirement_id} -> dry-run allocation preview
    POST /compute/matching/allocate  {requirement_id, strategy} -> persists Order + OrderAllocations
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db import Listing, Order, OrderAllocation, ReputationScore, Requirement, get_db
from grading.grade import derive_grade
from grading.lookup import get_grading_schema_attributes, get_latest_grading_result
from matching.allocation import Allocation, AllocationResult, ListingOffer, greedy_allocate
from matching.schemas import AllocateRequest, FindMatchesRequest

router = APIRouter(prefix="/compute/matching", tags=["matching"])


def _load_candidate_listings(db: Session, requirement: Requirement) -> list[ListingOffer]:
    """Build plain ListingOffer objects for the allocator from DB rows.

    Grade and geo-radius filtering are both real (§12) — grade via
    grading/grade.py:derive_grade, geo via matching/allocation.py:haversine_km
    against `requirement.region_lat/region_lng` + `search_radius_km`. All
    candidate listings share `requirement.vertical_id`, so the grading
    schema is fetched once rather than per listing.

    One remaining documented simplification: `price_points.region` is still
    a free-text mandi/market label with no relationship to these lat/lng
    coordinates (see pricing/router.py's `adjusted_price` docstring) — that
    needs real reverse-geocoding (or a bundled district-boundary dataset),
    neither of which this environment has, so it's left alone.
    """
    stmt = select(Listing).where(
        Listing.vertical_id == requirement.vertical_id,
        Listing.status == "ACTIVE",
        Listing.quantity > 0,
    )
    if requirement.commodity:
        stmt = stmt.where(Listing.commodity_name.ilike(requirement.commodity))
    listings = db.execute(stmt).scalars().all()

    schema_attributes = get_grading_schema_attributes(db, requirement.vertical_id)

    offers = []
    for listing in listings:
        reputation = db.execute(select(ReputationScore.score).where(ReputationScore.user_id == listing.seller_id)).scalar()
        latest_grading = get_latest_grading_result(db, listing.id)
        grade, _grade_score = derive_grade(
            latest_grading.attribute_scores if latest_grading else None, schema_attributes
        )
        offers.append(
            ListingOffer(
                listing_id=listing.id,
                available_quantity=listing.quantity,
                unit_price=listing.price_final or listing.price_suggested or 0.0,
                grade=grade,
                location_lat=listing.location_lat,
                location_lng=listing.location_lng,
                reputation_score=reputation or 0.0,
                status=listing.status,
            )
        )
    return offers


def _run_allocation(db: Session, requirement: Requirement) -> AllocationResult:
    offers = _load_candidate_listings(db, requirement)
    return greedy_allocate(
        quantity_needed=requirement.quantity,
        listings=offers,
        min_grade=requirement.min_grade or None,
        max_unit_price=requirement.max_price,
        center_lat=requirement.region_lat,
        center_lng=requirement.region_lng,
        radius_km=requirement.search_radius_km,
    )


def _serialize(allocations: list[Allocation]) -> list[dict]:
    return [{"listing_id": a.listing_id, "allocated_quantity": a.allocated_quantity, "unit_price": a.unit_price} for a in allocations]


@router.post("/find")
def find_matches(payload: FindMatchesRequest, db: Session = Depends(get_db)):
    try:
        requirement = db.get(Requirement, payload.requirement_id)
        if requirement is None:
            raise HTTPException(status_code=404, detail="requirement not found")
        result = _run_allocation(db, requirement)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    return {
        "requirement_id": requirement.id,
        "matches": _serialize(result.allocations),
        "requested_quantity": result.requested_quantity,
        "allocated_quantity": result.allocated_quantity,
        "shortfall": result.shortfall,
        "fully_fulfilled": result.fully_fulfilled,
    }


@router.post("/allocate")
def allocate(payload: AllocateRequest, db: Session = Depends(get_db)):
    try:
        requirement = db.get(Requirement, payload.requirement_id)
        if requirement is None:
            raise HTTPException(status_code=404, detail="requirement not found")

        result = _run_allocation(db, requirement)
        if not result.allocations:
            raise HTTPException(status_code=409, detail="no matching listings available for this requirement")

        total_price = sum(a.allocated_quantity * a.unit_price for a in result.allocations)
        # Order.status only has PENDING/CONFIRMED/FULFILLED/DISPUTED/CANCELLED
        # (no dedicated "partial" status) — partial fulfillment is instead
        # visible via the API response's `fully_fulfilled`/`shortfall` fields.
        order = Order(
            requirement_id=requirement.id,
            buyer_id=requirement.buyer_id,
            status="PENDING",
            total_price=total_price,
            created_at=datetime.now(timezone.utc),  # Django's auto_now_add is ORM-layer only; DB column is NOT NULL
        )
        db.add(order)
        db.flush()  # populate order.id before creating child allocations

        for a in result.allocations:
            db.add(
                OrderAllocation(
                    order_id=order.id,
                    listing_id=a.listing_id,
                    allocated_quantity=a.allocated_quantity,
                    unit_price=a.unit_price,
                    status="PENDING",
                )
            )
            # This endpoint used to create the allocation rows without ever
            # touching the source Listing — its `quantity` stayed at the
            # pre-allocation value forever, so the same stock could be
            # "matched" again by a later requirement, and the listing never
            # sold out through this path no matter how much of it was
            # allocated. Mirrors the same decrement/SOLD logic already
            # applied on direct bid acceptance (orders/serializers.py:
            # BidSerializer._create_order_for_accepted_bid on the Django side).
            listing = db.get(Listing, a.listing_id)
            remaining = listing.quantity - a.allocated_quantity
            listing.quantity = max(remaining, 0.0)
            if remaining <= 0:
                listing.status = "SOLD"

        requirement.status = "MATCHED" if result.fully_fulfilled else "OPEN"
        db.commit()
        db.refresh(order)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    return {
        "order_id": order.id,
        "allocations": _serialize(result.allocations),
        "total_price": total_price,
        "fully_fulfilled": result.fully_fulfilled,
        "shortfall": result.shortfall,
    }
