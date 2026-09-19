"""Unit tests for the pure greedy allocation algorithm (§5.3). No DB required."""
import math

from matching.allocation import ListingOffer, greedy_allocate, haversine_km


def test_exact_fulfillment_across_multiple_listings():
    listings = [
        ListingOffer(listing_id=1, available_quantity=50, unit_price=20, grade="Grade A"),
        ListingOffer(listing_id=2, available_quantity=50, unit_price=25, grade="Grade A"),
    ]

    result = greedy_allocate(quantity_needed=100, listings=listings)

    assert result.fully_fulfilled
    assert result.allocated_quantity == 100
    assert result.shortfall == 0
    assert [a.listing_id for a in result.allocations] == [1, 2]
    assert result.allocations[0].allocated_quantity == 50
    assert result.allocations[1].allocated_quantity == 50


def test_partial_fulfillment_when_supply_insufficient():
    listings = [
        ListingOffer(listing_id=1, available_quantity=30, unit_price=15, grade="Grade A"),
    ]

    result = greedy_allocate(quantity_needed=100, listings=listings)

    assert not result.fully_fulfilled
    assert result.allocated_quantity == 30
    assert result.shortfall == 70
    assert len(result.allocations) == 1
    assert result.allocations[0].listing_id == 1


def test_reputation_tie_break_on_equal_price():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=10, grade="Grade A", reputation_score=3.0),
        ListingOffer(listing_id=2, available_quantity=100, unit_price=10, grade="Grade A", reputation_score=4.5),
    ]

    result = greedy_allocate(quantity_needed=50, listings=listings)

    # Same unit price -> higher-reputation seller (listing 2) should be filled first.
    assert result.allocations[0].listing_id == 2
    assert result.allocations[0].allocated_quantity == 50
    assert len(result.allocations) == 1


def test_min_grade_filters_out_lower_grade_listings():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=5, grade="Grade C"),
        ListingOffer(listing_id=2, available_quantity=100, unit_price=8, grade="Grade A"),
    ]

    result = greedy_allocate(quantity_needed=50, listings=listings, min_grade="Grade A")

    assert [a.listing_id for a in result.allocations] == [2]
    assert result.fully_fulfilled


def test_inactive_listings_are_excluded():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=5, grade="Grade A", status="SOLD"),
        ListingOffer(listing_id=2, available_quantity=100, unit_price=8, grade="Grade A", status="ACTIVE"),
    ]

    result = greedy_allocate(quantity_needed=20, listings=listings)

    assert [a.listing_id for a in result.allocations] == [2]


def test_haversine_zero_distance_for_identical_points():
    assert haversine_km(26.9124, 75.7873, 26.9124, 75.7873) == 0.0


def test_haversine_known_quarter_meridian():
    # North pole to equator along the same meridian is a quarter of Earth's
    # circumference: (pi/2) * R ~= 10007.5 km.
    distance = haversine_km(90.0, 0.0, 0.0, 0.0)
    assert math.isclose(distance, (math.pi / 2) * 6371.0, rel_tol=1e-9)


def test_radius_filter_excludes_far_listings():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=10, grade="Grade A", location_lat=0.1, location_lng=0.0),  # ~11km away
        ListingOffer(listing_id=2, available_quantity=100, unit_price=5, grade="Grade A", location_lat=5.0, location_lng=0.0),  # ~555km away, cheaper
    ]

    result = greedy_allocate(
        quantity_needed=50, listings=listings, center_lat=0.0, center_lng=0.0, radius_km=100.0
    )

    # Listing 2 is cheaper but outside the radius — listing 1 wins despite
    # costing more, proving the filter actually excludes it rather than
    # just deprioritizing it.
    assert [a.listing_id for a in result.allocations] == [1]


def test_radius_filter_is_a_noop_without_all_three_params():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=5, grade="Grade A", location_lat=50.0, location_lng=50.0),
    ]

    # center given but no radius_km -> filter doesn't apply.
    result = greedy_allocate(quantity_needed=10, listings=listings, center_lat=0.0, center_lng=0.0)

    assert [a.listing_id for a in result.allocations] == [1]


def test_radius_filter_permits_listings_with_no_location():
    listings = [
        ListingOffer(listing_id=1, available_quantity=100, unit_price=5, grade="Grade A"),  # no location on record
    ]

    result = greedy_allocate(
        quantity_needed=10, listings=listings, center_lat=0.0, center_lng=0.0, radius_km=1.0
    )

    assert [a.listing_id for a in result.allocations] == [1]
