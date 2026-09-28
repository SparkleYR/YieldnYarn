"""Service-to-service guard for the routes only Django should call."""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from db import settings


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Rejects the request unless it carries COMPUTE_INTERNAL_TOKEN (when set)."""
    expected = settings.COMPUTE_INTERNAL_TOKEN
    if not expected:
        return
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid internal token")
