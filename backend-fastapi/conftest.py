import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Table, text

# Ensure `backend-fastapi/` is importable as the root package dir (e.g. `db`,
# `matching.allocation`) regardless of the directory pytest is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import Base, SessionLocal, engine  # noqa: E402

# `db.py` deliberately doesn't map the `users` table (see its docstring —
# nothing on the compute path needs to write users). Tests need it anyway,
# purely to satisfy real Postgres FK constraints (listings.seller_id,
# requirements.buyer_id, etc. all reference users(id) for real — this isn't
# a SQLAlchemy-only relationship). Mapped as a bare Core Table, test-only.
_users_table = Table(
    "users",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("password", String),
    Column("is_superuser", Boolean),
    Column("email", String),
    Column("phone", String),
    Column("role", String),
    Column("is_active", Boolean),
    Column("is_staff", Boolean),
    Column("created_at", DateTime(timezone=True)),
    extend_existing=True,
)


@pytest.fixture(scope="session")
def client():
    """TestClient against the live local Postgres (see docstring on
    `make_user` below re: why these are integration, not unit, tests) — runs
    the app's real lifespan (APScheduler start/stop) around the whole
    session rather than per-test, since starting/stopping it is not what
    these tests are about."""
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    """A raw SQLAlchemy session for test setup/teardown — separate from
    whatever session `get_db` hands the app during a request, since each
    TestClient call opens its own.

    NOTE on isolation: unlike Django's `manage.py test` (which creates and
    destroys a whole separate database per run), these tests write directly
    to the same local dev Postgres via the real `DATABASE_URL`, since
    `backend-fastapi` has no test-database convention of its own yet. Every
    fixture row created here uses an EMAIL_DOMAIN/name prefix and is deleted
    in a `finally` block, but a crash mid-test could leave rows behind —
    check for `*.pytest-fastapi.test` emails / `PYTEST FASTAPI` commodity
    names if the dev DB ever looks like it has stray data.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


EMAIL_DOMAIN = "pytest-fastapi.test"


def make_user(db_session, email: str, role: str = "BUYER") -> int:
    result = db_session.execute(
        _users_table.insert()
        .values(
            password="!",
            is_superuser=False,
            email=email,
            phone="",
            role=role,
            is_active=True,
            is_staff=False,
            created_at=datetime.now(timezone.utc),
        )
        .returning(_users_table.c.id)
    )
    db_session.commit()
    return result.scalar_one()


def delete_user(db_session, user_id: int) -> None:
    db_session.execute(_users_table.delete().where(_users_table.c.id == user_id))
    db_session.commit()


def cleanup_pytest_fixtures(db_session) -> None:
    """Best-effort sweep for any fixture rows a failed test left behind."""
    db_session.execute(text("DELETE FROM users WHERE email LIKE :pattern"), {"pattern": f"%@{EMAIL_DOMAIN}"})
    db_session.commit()
