"""Pricing endpoints (implementation_plan.md §5.2).

    GET /compute/pricing/base       ?vertical=&commodity=&region=
    GET /compute/pricing/adjusted   ?listing_id=
    GET /compute/pricing/estimate   ?vertical=&commodity=&quantity=&min_grade=&region=
    GET /compute/pricing/trends     ?vertical=&commodity=&region=&days=
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db import GradingResult, Listing, PricePoint, PricingRule, Vertical, get_db
from grading.grade import derive_grade
from grading.lookup import get_grading_schema_attributes
from pricing.service import apply_adjustments

router = APIRouter(prefix="/compute/pricing", tags=["pricing"])


def _get_vertical(db: Session, slug: str) -> Vertical:
    vertical = db.execute(select(Vertical).where(Vertical.slug == slug)).scalars().first()
    if vertical is None:
        raise HTTPException(status_code=404, detail=f"unknown vertical '{slug}'")
    return vertical


def _latest_price_point(db: Session, vertical_id: int, commodity: str, region: Optional[str]) -> Optional[PricePoint]:
    stmt = select(PricePoint).where(PricePoint.vertical_id == vertical_id, PricePoint.commodity.ilike(commodity))
    if region:
        stmt = stmt.where(PricePoint.region.ilike(region))
    stmt = stmt.order_by(PricePoint.timestamp.desc())
    return db.execute(stmt).scalars().first()


@router.get("/base")
def base_price(
    vertical: str = Query(...),
    commodity: str = Query(...),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        v = _get_vertical(db, vertical)
        pp = _latest_price_point(db, v.id, commodity, region)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    if pp is None:
        raise HTTPException(status_code=404, detail="no price data found for this vertical/commodity/region")

    return {
        "vertical": vertical,
        "commodity": commodity,
        "region": region,
        "base_price": pp.price,
        "source": pp.source,
        "as_of": pp.timestamp,
    }


@router.get("/adjusted")
def adjusted_price(listing_id: int = Query(...), db: Session = Depends(get_db)):
    try:
        listing = db.get(Listing, listing_id)
        if listing is None:
            raise HTTPException(status_code=404, detail="listing not found")

        vertical = db.get(Vertical, listing.vertical_id)
        rule = db.execute(select(PricingRule).where(PricingRule.vertical_id == listing.vertical_id)).scalars().first()
        # NOTE: `listings` has no text `region` field (it stores
        # location_lat/location_lng floats — see db.py); `price_points.region`
        # is a free-text mandi/market region string, so there's no direct join
        # key between the two yet. TODO: derive a region label from
        # location_lat/lng (e.g. reverse-geocode or a state/district lookup)
        # once that's needed for precise matching. For now, look up the most
        # recent price for this commodity across all regions.
        pp = _latest_price_point(db, listing.vertical_id, listing.commodity_name, region=None)
        base = pp.price if pp is not None else (listing.price_suggested or 0.0)

        latest_grading = (
            db.execute(
                select(GradingResult).where(GradingResult.listing_id == listing_id).order_by(GradingResult.created_at.desc())
            )
            .scalars()
            .first()
        )
        # See grading/grade.py:derive_grade (§12) — grade is None (multiplier
        # 1.0, no adjustment) if the listing hasn't been graded yet, or its
        # attribute_scores don't overlap a weighted schema attribute.
        schema_attributes = get_grading_schema_attributes(db, listing.vertical_id)
        grade, _grade_score = derive_grade(
            latest_grading.attribute_scores if latest_grading else None, schema_attributes
        )
        adjusted = apply_adjustments(base, rule.rules if rule else None, grade, listing.quantity)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    return {
        "listing_id": listing_id,
        "vertical": vertical.slug if vertical else None,
        "base_price": base,
        "adjusted_price": adjusted,
        "grade_used": grade,
        "has_grading_result": latest_grading is not None,
    }


@router.get("/estimate")
def estimate(
    vertical: str = Query(...),
    commodity: str = Query(...),
    quantity: float = Query(..., gt=0),
    min_grade: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        v = _get_vertical(db, vertical)
        pp = _latest_price_point(db, v.id, commodity, region)
        rule = db.execute(select(PricingRule).where(PricingRule.vertical_id == v.id)).scalars().first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    if pp is None:
        raise HTTPException(status_code=404, detail="no price data found for this vertical/commodity/region")

    unit_price = apply_adjustments(pp.price, rule.rules if rule else None, min_grade, quantity)
    return {
        "vertical": vertical,
        "commodity": commodity,
        "quantity": quantity,
        "min_grade": min_grade,
        "unit_price": unit_price,
        "estimated_total": round(unit_price * quantity, 2),
    }


@router.get("/trends")
def trends(
    vertical: str = Query(...),
    commodity: str = Query(...),
    region: Optional[str] = Query(None),
    days: int = Query(30, gt=0, le=365),
    db: Session = Depends(get_db),
):
    try:
        v = _get_vertical(db, vertical)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        stmt = select(PricePoint).where(
            PricePoint.vertical_id == v.id,
            PricePoint.commodity.ilike(commodity),
            PricePoint.timestamp >= cutoff,
        )
        if region:
            stmt = stmt.where(PricePoint.region.ilike(region))
        points = db.execute(stmt.order_by(PricePoint.timestamp.asc())).scalars().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    return {
        "vertical": vertical,
        "commodity": commodity,
        "region": region,
        "days": days,
        "points": [{"timestamp": p.timestamp, "price": p.price, "source": p.source} for p in points],
    }
