"""Unit tests for the letter-grade derivation (§12). No DB required."""
from grading.grade import derive_grade

SCHEMA = [
    {"name": "moisture", "weight": 0.5, "gradeable_by_ml": True},
    {"name": "purity", "weight": 0.3, "gradeable_by_ml": True},
    {"name": "color", "weight": 0.2, "gradeable_by_ml": False},
]


def test_high_scores_yield_grade_a():
    grade, score = derive_grade({"moisture": 0.95, "purity": 0.9}, SCHEMA)

    assert grade == "Grade A"
    assert score == 0.9312  # (0.95*0.5 + 0.9*0.3) / 0.8, rounded


def test_mid_scores_yield_grade_b():
    grade, score = derive_grade({"moisture": 0.7, "purity": 0.7}, SCHEMA)

    assert grade == "Grade B"
    assert score == 0.7


def test_low_scores_yield_grade_c():
    grade, score = derive_grade({"moisture": 0.3, "purity": 0.2}, SCHEMA)

    assert grade == "Grade C"
    assert score == 0.2625


def test_threshold_boundaries_are_inclusive():
    grade, _ = derive_grade({"moisture": 0.85, "purity": 0.85}, SCHEMA)
    assert grade == "Grade A"

    grade, _ = derive_grade({"moisture": 0.65, "purity": 0.65}, SCHEMA)
    assert grade == "Grade B"


def test_ignores_attributes_not_in_schema():
    grade, score = derive_grade(
        {"moisture": 0.9, "purity": 0.9, "not_in_schema": 0.0}, SCHEMA
    )

    assert grade == "Grade A"
    assert score == 0.9  # not_in_schema contributes no weight either way


def test_ignores_schema_attributes_with_zero_weight():
    schema = [{"name": "x", "weight": 0}, {"name": "y", "weight": 1.0}]

    grade, score = derive_grade({"x": 0.0, "y": 0.9}, schema)

    assert grade == "Grade A"
    assert score == 0.9


def test_no_overlap_returns_none():
    grade, score = derive_grade({"unrelated": 0.9}, SCHEMA)

    assert grade is None
    assert score is None


def test_empty_attribute_scores_returns_none():
    grade, score = derive_grade({}, SCHEMA)

    assert grade is None
    assert score is None


def test_none_inputs_return_none():
    grade, score = derive_grade(None, None)

    assert grade is None
    assert score is None
