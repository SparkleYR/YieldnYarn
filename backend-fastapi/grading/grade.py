"""Letter-grade derivation from `GradingResult.attribute_scores` (implementation_plan.md §12).

This contract was explicitly left unresolved elsewhere in the codebase —
`pricing/router.py` and `matching/router.py` both carry `grade = None  # TODO`
markers rather than guessing at it independently. It's implemented once,
here, and both call into it.

`attribute_scores` values are `[0, 1]` per-attribute quality scores, on the
same scale as `overall_confidence` (see grading/pipeline.py — both the
OpenCV-heuristic path and the stub-fallback path produce scores in this
range). This derives a single grade as the `GradingSchema.attributes`
weight-weighted average of the scores present in `attribute_scores`, then
buckets that average via `GRADE_THRESHOLDS`.

This is a deliberate, simple, documented choice for an underspecified
contract, not a definitive design — swap `GRADE_THRESHOLDS` or the
weighting scheme freely. Nothing outside this module depends on the
internals, only the `(grade, score)` return shape. Output uses the
"Grade A"/"Grade B"/"Grade C" convention already established by
`PricingRule.rules.grade_adjustment_table` and every frontend mock fixture
(`lib/mock-data.ts`) — `matching/allocation.py`'s `DEFAULT_GRADE_ORDER` was
updated to match (see its own history/tests) rather than introducing a third
convention.
"""
from __future__ import annotations

from typing import Optional

# (minimum weighted-average score, grade label), checked high to low.
GRADE_THRESHOLDS: list[tuple[float, str]] = [
    (0.85, "Grade A"),
    (0.65, "Grade B"),
    (0.0, "Grade C"),
]


def derive_grade(
    attribute_scores: Optional[dict], schema_attributes: Optional[list[dict]]
) -> tuple[Optional[str], Optional[float]]:
    """Derive a letter grade from `attribute_scores` weighted by the vertical's
    `GradingSchema.attributes` weights.

    Args:
        attribute_scores: `GradingResult.attribute_scores` — dict of
            attribute name -> score in [0, 1].
        schema_attributes: the vertical's `GradingSchema.attributes` JSON
            (list of `{"name": str, "weight": float, ...}`).

    Returns:
        `(grade, weighted_average_score)`, or `(None, None)` if there's
        nothing to grade — no attributes in `attribute_scores` match a
        weighted schema attribute (e.g. an empty/stub result, or a schema
        with no matching names/weights).
    """
    weight_by_name = {a.get("name"): a.get("weight", 0) or 0 for a in (schema_attributes or [])}

    total_weight = 0.0
    weighted_sum = 0.0
    for name, score in (attribute_scores or {}).items():
        weight = weight_by_name.get(name)
        if not weight:
            continue
        total_weight += weight
        weighted_sum += weight * score

    if total_weight <= 0:
        return None, None

    # Round before thresholding, not just before returning — otherwise
    # float accumulation error (e.g. 0.85*0.5 + 0.85*0.3 == 0.8499999999999999
    # in binary floating point) can misclassify an exact threshold value.
    average = round(weighted_sum / total_weight, 4)
    for threshold, label in GRADE_THRESHOLDS:
        if average >= threshold:
            return label, average
    return None, None  # unreachable given a 0.0 floor, kept for safety
