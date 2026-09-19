"""Pure greedy multi-listing allocation algorithm (implementation_plan.md §5.3).

Deliberately decoupled from SQLAlchemy/DB objects — takes and returns plain
dataclasses — so it can be unit tested in isolation (see tests/test_allocation.py)
and reused by both `POST /compute/matching/find` (dry-run preview) and
`POST /compute/matching/allocate` (persisted allocation).

Algorithm (§5.3):
    1. Filter listings by grade >= min_grade, within radius_km of
       (center_lat, center_lng) if given, status == ACTIVE.
    2. Sort by effective unit price ascending.
    3. Greedy allocation: fill from cheapest first.
    4. Tie-break by seller reputation score (higher reputation preferred).
    5. Partial allocation supported: if total available < requested quantity,
       whatever can be filled is returned (see `AllocationResult.shortfall`).
    6. Output: list of (listing_id, allocated_quantity, unit_price).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

# Ascending quality order — extend or replace per-vertical if grades aren't
# a simple A/B/C scale. Matches the "Grade A"/"Grade B"/"Grade C" convention
# from grading/grade.py:derive_grade, PricingRule.rules.grade_adjustment_table,
# and every frontend mock fixture — not bare "A"/"B"/"C".
DEFAULT_GRADE_ORDER = ["Grade C", "Grade B", "Grade A"]

EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


@dataclass
class ListingOffer:
    """Plain representation of a listing candidate for allocation."""

    listing_id: int
    available_quantity: float
    unit_price: float
    grade: Optional[str] = None
    location_lat: Optional[float] = None
    location_lng: Optional[float] = None
    reputation_score: float = 0.0
    status: str = "ACTIVE"


@dataclass
class Allocation:
    listing_id: int
    allocated_quantity: float
    unit_price: float


@dataclass
class AllocationResult:
    allocations: list[Allocation] = field(default_factory=list)
    requested_quantity: float = 0.0
    allocated_quantity: float = 0.0

    @property
    def shortfall(self) -> float:
        return max(0.0, self.requested_quantity - self.allocated_quantity)

    @property
    def fully_fulfilled(self) -> bool:
        return self.shortfall <= 1e-9


def _grade_rank(grade: Optional[str], grade_order: list[str]) -> int:
    if grade is None:
        return -1  # ungraded listings rank below every explicit grade
    try:
        return grade_order.index(grade)
    except ValueError:
        return -1


def _within_radius(
    listing: ListingOffer,
    center_lat: Optional[float],
    center_lng: Optional[float],
    radius_km: Optional[float],
) -> bool:
    """True if the geo filter doesn't apply, or the listing has no location
    on record (permissive — we can't rule it out, so don't exclude it,
    matching this module's existing "first pass" tolerance for missing
    data), or it's genuinely within `radius_km` of the center point."""
    if center_lat is None or center_lng is None or radius_km is None:
        return True
    if listing.location_lat is None or listing.location_lng is None:
        return True
    return haversine_km(center_lat, center_lng, listing.location_lat, listing.location_lng) <= radius_km


def greedy_allocate(
    quantity_needed: float,
    listings: list[ListingOffer],
    min_grade: Optional[str] = None,
    max_unit_price: Optional[float] = None,
    center_lat: Optional[float] = None,
    center_lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    grade_order: Optional[list[str]] = None,
) -> AllocationResult:
    """Greedy least-cost allocation across `listings` to fulfil `quantity_needed`.

    Geo filtering (`center_lat`/`center_lng`/`radius_km`) only applies when
    all three are given — pass none of them to skip it entirely.
    """
    grade_order = grade_order or DEFAULT_GRADE_ORDER
    min_rank = _grade_rank(min_grade, grade_order) if min_grade else None

    candidates = [
        listing
        for listing in listings
        if listing.status == "ACTIVE"
        and listing.available_quantity > 0
        and _within_radius(listing, center_lat, center_lng, radius_km)
        and (max_unit_price is None or listing.unit_price <= max_unit_price)
        and (min_rank is None or _grade_rank(listing.grade, grade_order) >= min_rank)
    ]

    # Sort by price ascending; among equal prices, prefer higher reputation.
    candidates.sort(key=lambda listing: (listing.unit_price, -listing.reputation_score))

    result = AllocationResult(requested_quantity=quantity_needed)
    remaining = quantity_needed
    for listing in candidates:
        if remaining <= 1e-9:
            break
        take = min(remaining, listing.available_quantity)
        if take <= 0:
            continue
        result.allocations.append(Allocation(listing.listing_id, take, listing.unit_price))
        remaining -= take

    result.allocated_quantity = quantity_needed - remaining
    return result
