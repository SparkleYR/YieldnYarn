"""Letter-grade derivation from `GradingResult.attribute_scores` (implementation_plan.md §12).

Deliberately mirrors `backend-fastapi/grading/grade.py` exactly — same
weighted-average-by-schema-weight logic, same "Grade A"/"Grade B"/"Grade C"
thresholds. Duplicated rather than imported (these are two separate Python
processes/deployments) but kept intentionally tiny and dependency-free so
the two stay trivial to keep in sync. If you change the thresholds or the
weighting scheme, change both.

This one lives on the Django side because `VerificationQueueView` needs it
for read-only display across many listings at once — going through FastAPI's
HTTP endpoint per listing would mean an N+1 network round trip for what's a
handful of pure arithmetic on data Django already has direct DB access to.
"""
from __future__ import annotations

# Mirrors backend-fastapi/grading/pipeline.py:CONFIDENCE_VERIFICATION_THRESHOLD —
# listings only reach PENDING_VERIFICATION because their AI confidence was
# below this. Kept here too since VerificationQueueView derives priority from
# how far below it a given listing's confidence falls.
CONFIDENCE_VERIFICATION_THRESHOLD = 0.80

# (minimum weighted-average score, grade label), checked high to low.
GRADE_THRESHOLDS: list[tuple[float, str]] = [
    (0.85, "Grade A"),
    (0.65, "Grade B"),
    (0.0, "Grade C"),
]


def derive_grade(
    attribute_scores: dict | None, schema_attributes: list[dict] | None
) -> tuple[str | None, float | None]:
    """See backend-fastapi/grading/grade.py:derive_grade — identical contract."""
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

    average = round(weighted_sum / total_weight, 4)
    for threshold, label in GRADE_THRESHOLDS:
        if average >= threshold:
            return label, average
    return None, None  # unreachable given a 0.0 floor, kept for safety
