"""Grading endpoints (implementation_plan.md §5.2).

    POST /compute/grading/grade          {listing_id} -> triggers ML grading
    GET  /compute/grading/status/{id}    -> latest grading result / status

Runs synchronously for now (per current project scope) — a background task
queue can replace the direct call to `grade_attributes` later without
changing the route contracts.
"""
from __future__ import annotations

import logging
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

import httpx

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db import GradingEvidence, GradingResult, Listing, Vertical, get_db, settings
from grading.grade import derive_grade
from grading.lookup import get_grading_schema_attributes
from grading.pipeline import CONFIDENCE_VERIFICATION_THRESHOLD, grade_attributes
from grading.schemas import GradeRequest, GradeResponse, GradingStatusResponse

router = APIRouter(prefix="/compute/grading", tags=["grading"])


_DEFAULT_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "backend-django" / "media"


def resolve_evidence_path(stored: str) -> str:
    """`grading_evidence.file` holds a path relative to Django's MEDIA_ROOT
    (e.g. `grading_evidence/listing_12/grain.jpg`); resolve it against the
    same directory so this service can actually open the file."""
    path = Path(stored)
    if path.is_absolute():
        return str(path)
    media_root = Path(settings.DJANGO_MEDIA_ROOT) if settings.DJANGO_MEDIA_ROOT else _DEFAULT_MEDIA_ROOT
    return str(media_root / path)


logger = logging.getLogger("grading.router")


@contextmanager
def local_evidence(stored_paths: list[str]) -> Iterator[list[str]]:
    """Local file paths for the evidence, downloading any that aren't on disk.

    In local dev (and docker-compose) Django and this service share the media
    directory. On Azure, Django stores evidence in Blob Storage: set
    EVIDENCE_BASE_URL (the container URL) and, for a private container,
    EVIDENCE_URL_QUERY (a read-only SAS token), and the files are fetched to a
    temporary directory for the duration of grading. Files that can't be
    found either way are skipped (grading then falls back / routes to a
    verifier rather than failing).
    """
    with tempfile.TemporaryDirectory(prefix="msme-evidence-") as tmp:
        paths: list[str] = []
        for stored in stored_paths:
            local = resolve_evidence_path(stored)
            if Path(local).exists():
                paths.append(local)
                continue
            if not settings.EVIDENCE_BASE_URL:
                logger.warning("Evidence %s not found at %s and no EVIDENCE_BASE_URL set", stored, local)
                continue
            url = f"{settings.EVIDENCE_BASE_URL.rstrip('/')}/{stored.lstrip('/')}"
            if settings.EVIDENCE_URL_QUERY:
                url += "?" + settings.EVIDENCE_URL_QUERY.lstrip("?")
            try:
                response = httpx.get(url, timeout=30.0)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Could not download evidence %s: %s", stored, exc)
                continue
            target = Path(tmp) / f"{len(paths)}_{Path(stored).name}"
            target.write_bytes(response.content)
            paths.append(str(target))
        yield paths


def _ml_attribute_names(attributes: list[dict]) -> list[str]:
    """Names of attributes flagged `gradeable_by_ml: true` in the vertical's grading_schema."""
    return [a["name"] for a in attributes if a.get("gradeable_by_ml")]


@router.post("/grade", response_model=GradeResponse)
def trigger_grading(payload: GradeRequest, db: Session = Depends(get_db)) -> GradeResponse:
    try:
        listing = db.get(Listing, payload.listing_id)
        if listing is None:
            raise HTTPException(status_code=404, detail="listing not found")

        evidence = db.execute(select(GradingEvidence).where(GradingEvidence.listing_id == listing.id)).scalars().all()
        stored_evidence = [e.file for e in evidence if e.file_type == "IMAGE"]
        vertical = db.get(Vertical, listing.vertical_id)
        schema_attributes = get_grading_schema_attributes(db, listing.vertical_id)
        ml_attributes = _ml_attribute_names(schema_attributes)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    with local_evidence(stored_evidence) as evidence_paths:
        grading = grade_attributes(evidence_paths, ml_attributes, vertical.slug if vertical else None)
    grade, _grade_score = derive_grade(grading["attribute_scores"], schema_attributes)

    persistence_error: str | None = None
    result_id: int | None = None
    created_at = None
    try:
        record = GradingResult(
            listing_id=listing.id,
            source="AI",
            confidence_score=grading["overall_confidence"],
            attribute_scores=grading["attribute_scores"],
            graded_by_id=None,
            notes=grading["method"],
            created_at=datetime.now(timezone.utc),  # Django's auto_now_add is ORM-layer only; DB column is NOT NULL
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        result_id = record.id
        created_at = record.created_at
    except SQLAlchemyError as exc:
        db.rollback()
        # The grading computation itself succeeded even if persistence
        # didn't (e.g. table not migrated yet) — surface both.
        persistence_error = str(exc)

    return GradeResponse(
        listing_id=listing.id,
        grading_result_id=result_id,
        attribute_scores=grading["attribute_scores"],
        overall_confidence=grading["overall_confidence"],
        needs_verification=grading["needs_verification"],
        method=grading["method"],
        grade=grade,
        created_at=created_at,
        persistence_error=persistence_error,
    )


@router.get("/status/{listing_id}", response_model=GradingStatusResponse)
def grading_status(listing_id: int, db: Session = Depends(get_db)) -> GradingStatusResponse:
    try:
        result = (
            db.execute(
                select(GradingResult).where(GradingResult.listing_id == listing_id).order_by(GradingResult.created_at.desc())
            )
            .scalars()
            .first()
        )
        listing = db.get(Listing, listing_id) if result is not None else None
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=f"Database not ready: {exc}") from exc

    if result is None:
        return GradingStatusResponse(listing_id=listing_id, status="NOT_GRADED")

    schema_attributes = get_grading_schema_attributes(db, listing.vertical_id if listing else None)
    grade, _grade_score = derive_grade(result.attribute_scores, schema_attributes)

    status = "VERIFICATION_PENDING" if result.confidence_score < CONFIDENCE_VERIFICATION_THRESHOLD else "GRADED"
    return GradingStatusResponse(
        listing_id=listing_id,
        status=status,
        confidence_score=result.confidence_score,
        attribute_scores=result.attribute_scores,
        source=result.source,
        grade=grade,
        created_at=result.created_at,
    )
