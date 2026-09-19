"""Shared DB lookups for grading data, used by grading/, pricing/, and
matching/ routers alike (§12) — kept here rather than duplicated per-router.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db import GradingResult, GradingSchema
from grading.grade import derive_grade


def get_grading_schema_attributes(db: Session, vertical_id: Optional[int]) -> list[dict]:
    """The vertical's `GradingSchema.attributes` JSON, or `[]` if unset."""
    if vertical_id is None:
        return []
    schema = db.execute(select(GradingSchema).where(GradingSchema.vertical_id == vertical_id)).scalars().first()
    return schema.attributes if schema and schema.attributes else []


def get_latest_grading_result(db: Session, listing_id: int) -> Optional[GradingResult]:
    return (
        db.execute(
            select(GradingResult).where(GradingResult.listing_id == listing_id).order_by(GradingResult.created_at.desc())
        )
        .scalars()
        .first()
    )


def grade_for_listing(
    db: Session, listing_id: int, vertical_id: Optional[int]
) -> tuple[Optional[str], Optional[float]]:
    """The listing's current letter grade (from its latest GradingResult), or
    `(None, None)` if it hasn't been graded or nothing overlaps the schema."""
    result = get_latest_grading_result(db, listing_id)
    if result is None:
        return None, None
    attributes = get_grading_schema_attributes(db, vertical_id)
    return derive_grade(result.attribute_scores, attributes)
