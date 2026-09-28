"""X-Internal-Token guard on the Django-only routes (grading, matching)."""
import pytest

from db import settings


@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(settings, "COMPUTE_INTERNAL_TOKEN", "s3cret")
    return "s3cret"


@pytest.mark.parametrize("path", ["/compute/grading/grade", "/compute/matching/find", "/compute/matching/allocate"])
def test_internal_routes_reject_missing_or_wrong_token(client, token, path):
    assert client.post(path, json={}).status_code == 401
    assert client.post(path, json={}, headers={"X-Internal-Token": "nope"}).status_code == 401


def test_right_token_reaches_the_route(client, token):
    # 422: past the guard, rejected by the route's own body validation.
    response = client.post("/compute/matching/find", json={}, headers={"X-Internal-Token": token})
    assert response.status_code == 422


def test_pricing_stays_public(client, token):
    assert client.get("/compute/pricing/base", params={"vertical": "x", "commodity": "y"}).status_code != 401


def test_not_enforced_when_unset(client):
    assert settings.COMPUTE_INTERNAL_TOKEN == ""
    assert client.post("/compute/matching/find", json={}).status_code == 422
