"""Integration tests for POST /compute/grading/grade and GET /compute/grading/status/{id}.

Requires a running local Postgres (DATABASE_URL) — see conftest.py's
`db_session` docstring for the isolation tradeoff these accept.
"""
from datetime import datetime, timezone

from db import GradingResult
from tests.db_fixtures import cleanup, make_listing, make_user, make_vertical


def test_trigger_grading_returns_404_for_missing_listing(client):
    response = client.post("/compute/grading/grade", json={"listing_id": 999999999})
    assert response.status_code == 404


def test_trigger_grading_stub_with_no_ml_attributes(client, db_session):
    seller_id = make_user(db_session, "seller1@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-grading-a")  # no attributes configured
    listing_id = make_listing(db_session, seller_id, vertical_id)
    try:
        response = client.post("/compute/grading/grade", json={"listing_id": listing_id})

        assert response.status_code == 200
        body = response.json()
        assert body["overall_confidence"] == 0.75
        assert body["needs_verification"] is True
        assert body["attribute_scores"] == {}
        assert body["grade"] is None  # nothing to weight-average — no ML attributes configured
        assert body["grading_result_id"] is not None
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])


def test_trigger_grading_derives_grade_from_stub_scores(client, db_session):
    # No requirements-ml.txt installed in this environment, so grading always
    # falls back to the deterministic stub (confidence 0.75 for every
    # configured ML-gradeable attribute) — that's real, current behavior,
    # not a test-only shortcut. A single full-weight attribute makes the
    # derived grade fully predictable: 0.75 falls in the Grade B band.
    seller_id = make_user(db_session, "seller2@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(
        db_session, "pytest-grading-b", attributes=[{"name": "foreign_matter", "weight": 1.0, "gradeable_by_ml": True}]
    )
    listing_id = make_listing(db_session, seller_id, vertical_id)
    try:
        response = client.post("/compute/grading/grade", json={"listing_id": listing_id})

        assert response.status_code == 200
        body = response.json()
        assert body["attribute_scores"] == {"foreign_matter": 0.75}
        assert body["grade"] == "Grade B"
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])


def test_grading_status_not_graded_when_no_result(client, db_session):
    seller_id = make_user(db_session, "seller3@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(db_session, "pytest-grading-c")
    listing_id = make_listing(db_session, seller_id, vertical_id)
    try:
        response = client.get(f"/compute/grading/status/{listing_id}")

        assert response.status_code == 200
        assert response.json() == {
            "listing_id": listing_id,
            "status": "NOT_GRADED",
            "confidence_score": None,
            "attribute_scores": None,
            "source": None,
            "grade": None,
            "created_at": None,
        }
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])


def test_grading_status_reflects_latest_result_and_grade(client, db_session):
    seller_id = make_user(db_session, "seller4@pytest-fastapi.test", "SELLER")
    vertical_id = make_vertical(
        db_session, "pytest-grading-d", attributes=[{"name": "purity", "weight": 1.0, "gradeable_by_ml": True}]
    )
    listing_id = make_listing(db_session, seller_id, vertical_id)
    db_session.add(
        GradingResult(
            listing_id=listing_id,
            source="AI",
            confidence_score=0.9,
            attribute_scores={"purity": 0.9},
            created_at=datetime.now(timezone.utc),
        )
    )
    db_session.commit()
    try:
        response = client.get(f"/compute/grading/status/{listing_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "GRADED"  # 0.9 >= CONFIDENCE_VERIFICATION_THRESHOLD (0.80)
        assert body["grade"] == "Grade A"
        assert body["source"] == "AI"
    finally:
        cleanup(db_session, listing_ids=[listing_id], vertical_ids=[vertical_id], seller_ids=[seller_id])
