"""Database engine/session setup + SQLAlchemy models for compute-path tables.

Configuration is loaded via pydantic-settings from the monorepo root `.env`
(shared with backend-django and web-app). See implementation_plan.md §3.1 for
the canonical schema — Django owns the actual migrations; this module mirrors
the subset of tables FastAPI's compute services need to read/write.

NOTE ON TABLE NAMES: a separate agent owns the Django models/migrations for
this same database. Table names below have been verified directly against
the applied migrations/live schema (Django sets an explicit `Meta.db_table`
per model matching the plain names from implementation_plan.md §3.1, e.g.
`verticals`, `listings`, `grading_results` — NOT Django's default
`<app_label>_<modelname>` convention). Column names/types were verified via
`\\d <table>` against the running `msme-postgres` container. If Django's
schema changes later, update the affected model(s) below to match.

`price_points` (Agmarknet/market data ingestion) was initially a gap in the
plan's Django app assignments but has since been added by the Django agent
and is live in the DB — mapped below against its real schema.

`bids` exists in Django but isn't needed by any compute-path endpoint yet,
so it's intentionally not mapped here.

The app is designed to boot cleanly even if a table doesn't exist yet (e.g.
migrations haven't run) — engine/session creation here doesn't touch the
database; only actual queries in the routers can fail, and those are
wrapped in try/except around SQLAlchemyError.
"""
from __future__ import annotations

import uuid
from typing import Generator

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session, declarative_base, sessionmaker


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", env_file_encoding="utf-8", extra="ignore")

    # Falls back to the known local docker-compose credentials if `.env`
    # can't be found/read (e.g. running from an unexpected cwd), so the app
    # still boots for local dev/testing.
    DATABASE_URL: str = "postgresql://msme_dev:devpassword@localhost:5432/msme_marketplace"


settings = Settings()


def _normalize_db_url(url: str) -> str:
    """Force the psycopg3 dialect driver.

    `DATABASE_URL` is a plain `postgresql://` URL (psycopg2-style), but this
    project installs `psycopg[binary]>=3.2` (psycopg3). SQLAlchemy needs an
    explicit `+psycopg` driver suffix to pick psycopg3 instead of defaulting
    to (uninstalled) psycopg2.
    """
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


engine = create_engine(_normalize_db_url(settings.DATABASE_URL), pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a DB session, always closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------
# Models (verified against backend-django's applied migrations)
# --------------------------------------------------------------------------


class Vertical(Base):
    __tablename__ = "verticals"

    id = Column(Integer, primary_key=True)
    name = Column(String)
    slug = Column(String, unique=True, index=True)
    unit_of_measure = Column(String)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True))


class GradingSchema(Base):
    __tablename__ = "grading_schemas"

    id = Column(Integer, primary_key=True)
    vertical_id = Column(Integer, ForeignKey("verticals.id"))
    # List of {name, type, range, ideal_value, weight, gradeable_by_ml}.
    # NOT NULL at the DB level, no DB-side default — same ORM-only-default
    # gap as the other fields flagged in this file (§12 test-coverage pass).
    attributes = Column(JSON, default=list, nullable=False)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class PricingRule(Base):
    __tablename__ = "pricing_rules"

    id = Column(Integer, primary_key=True)
    vertical_id = Column(Integer, ForeignKey("verticals.id"))
    # {"grade_adjustment_table": [...], "quantity_tier_table": [...]} — see
    # pricing/service.py. NOT NULL at the DB level, no DB-side default.
    rules = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True)
    # NOT NULL at the DB level (Django sets it client-side via
    # `default=uuid.uuid4` on every save — there's no DB-level default) and
    # was missing from this mapping entirely until a test tried to INSERT a
    # Listing through it and hit a real NotNullViolation. Nothing on the
    # compute path reads this column, but any INSERT needs it satisfied.
    client_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, nullable=False)
    # NOTE: no FK to `users.id` here — the `users` table (owned by Django's
    # `accounts` app) isn't mapped in this metadata. Referential integrity is
    # already enforced at the DB level by Django's migration; declaring a
    # SQLAlchemy ForeignKey to an unmapped table breaks ORM flush/dependency
    # resolution (e.g. `session.flush()`) without adding any real benefit here.
    seller_id = Column(Integer)
    vertical_id = Column(Integer, ForeignKey("verticals.id"))
    commodity_name = Column(String)
    # NOT NULL at the DB level, no DB-side default (Django's `blank=True,
    # default=""` is enforced at the ORM layer only) — was wrongly marked
    # `nullable=True` here; same class of gap as client_uuid above, found
    # the same way.
    sub_category = Column(String, default="", nullable=False)
    quantity = Column(Float)
    unit = Column(String)
    price_suggested = Column(Float, nullable=True)
    price_final = Column(Float, nullable=True)
    # PostGIS-in-spirit but stored as plain lat/lng floats by Django (no
    # geoalchemy2 dependency needed here). Real haversine-distance radius
    # matching is live — see matching/allocation.py:haversine_km /
    # Requirement.search_radius_km.
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    status = Column(String, default="DRAFT", nullable=False)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class GradingEvidence(Base):
    __tablename__ = "grading_evidence"

    id = Column(Integer, primary_key=True)
    listing_id = Column(Integer, ForeignKey("listings.id"))
    file = Column(String)  # Django FileField -> relative path string
    file_type = Column(String)  # IMAGE | VIDEO | DOCUMENT
    uploaded_at = Column(DateTime(timezone=True))


class GradingResult(Base):
    __tablename__ = "grading_results"

    id = Column(Integer, primary_key=True)
    listing_id = Column(Integer, ForeignKey("listings.id"))
    source = Column(String)  # AI | VERIFIER
    confidence_score = Column(Float, nullable=True)
    attribute_scores = Column(JSON, default=dict, nullable=False)
    graded_by_id = Column(Integer, nullable=True)  # nullable for AI; see NOTE on Listing.seller_id re: no users FK
    created_at = Column(DateTime(timezone=True))
    # NOT NULL at the DB level, no DB-side default (Django's `blank=True,
    # default=""` is ORM-only) — was wrongly `nullable=True` here.
    notes = Column(Text, default="", nullable=False)


class PricePoint(Base):
    """Agmarknet/market-data ingestion table, owned by Django (verified live
    schema — see `psql \\d price_points`). Indexed for lookup via
    `idx_price_points_lookup` btree(vertical_id, commodity, region,
    timestamp DESC), matching the query pattern used in pricing/service.py.
    """

    __tablename__ = "price_points"

    id = Column(Integer, primary_key=True)
    vertical_id = Column(Integer, ForeignKey("verticals.id", ondelete="CASCADE"))
    commodity = Column(String(150), nullable=False)
    region = Column(String(150), nullable=False)
    price = Column(Float, nullable=False)
    source = Column(String(20), nullable=False)  # AGMARKNET | ADMIN_ENTERED | CCI
    timestamp = Column(DateTime(timezone=True), nullable=False)
    raw_data = Column(JSON, nullable=False, default=dict)


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(Integer, primary_key=True)
    buyer_id = Column(Integer)  # see NOTE on Listing.seller_id re: no users FK
    vertical_id = Column(Integer, ForeignKey("verticals.id"))
    commodity = Column(String)
    quantity = Column(Float)
    # NOT NULL at the DB level, no DB-side default — was wrongly `nullable=True`.
    min_grade = Column(String, default="", nullable=False)
    max_price = Column(Float, nullable=True)
    budget = Column(Float, nullable=True)
    # Free-text region label (implementation_plan.md §12) — NOT NULL, no
    # DB-side default, same drift-prone pattern as the other CharField(blank=True,
    # default="") columns already fixed above.
    region = Column(String, default="", nullable=False)
    region_lat = Column(Float, nullable=True)
    region_lng = Column(Float, nullable=True)
    search_radius_km = Column(Float, default=100.0, nullable=False)
    status = Column(String, default="OPEN", nullable=False)
    created_at = Column(DateTime(timezone=True))


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True)
    requirement_id = Column(Integer, ForeignKey("requirements.id"), nullable=True)
    buyer_id = Column(Integer)  # see NOTE on Listing.seller_id re: no users FK
    status = Column(String, default="PENDING", nullable=False)
    total_price = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True))


class OrderAllocation(Base):
    __tablename__ = "order_allocations"

    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.id"))
    listing_id = Column(Integer, ForeignKey("listings.id"))
    allocated_quantity = Column(Float)
    unit_price = Column(Float)
    # NOT NULL at the DB level, no DB-side default — was wrongly `nullable=True`.
    # (Every current insert site sets this explicitly, so this hadn't broken
    # anything yet, but the mapping itself was inaccurate.)
    status = Column(String, default="PENDING", nullable=False)


class ReputationScore(Base):
    __tablename__ = "reputation_scores"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, unique=True)  # see NOTE on Listing.seller_id re: no users FK
    role = Column(String)
    score = Column(Float, default=0.0, nullable=False)
    # NOT NULL at the DB level, no DB-side default — were wrongly `nullable=True`.
    grade_accuracy_score = Column(Float, default=0.0, nullable=False)
    fulfillment_score = Column(Float, default=0.0, nullable=False)
    payment_score = Column(Float, default=0.0, nullable=False)
    total_transactions = Column(Integer, default=0, nullable=False)
    last_updated = Column(DateTime(timezone=True))
