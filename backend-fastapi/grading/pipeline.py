"""ML grading pipeline (implementation_plan.md §9).

Lazily imports the heavy ML stack (opencv-python, torch, torchvision,
ultralytics, numpy — see requirements-ml.txt) so the base service stays fast
to install and boots cleanly without them. When unavailable, grading falls
back to a deterministic stub result (clearly logged) so the rest of the
system — DB writes, verification-queue routing, API contracts — can still be
exercised end-to-end without the ML dependencies installed.

Real inference: for every ML-gradeable attribute that has a fine-tuned
checkpoint (`<GRADING_MODELS_DIR>/<vertical>/<attribute>.pt`, produced by
ml-training/scripts/train_classifier.py — see grading/classifier.py), the
attribute is scored by the MobileNetV3-Small classifier. Attributes without a
checkpoint yet keep using the OpenCV edge-density proxy (or the stub when
the ML stack isn't installed), so models can be rolled out one attribute at
a time as labeled data accumulates (§9.3 training plan).
"""
from __future__ import annotations

import importlib.util
import logging
from pathlib import Path
from typing import Callable, Optional

from grading.classifier import combine_predictions, load_classifier, load_grader

logger = logging.getLogger("grading.pipeline")

# confidence < 80% -> route to verification queue (§9.1)
CONFIDENCE_VERIFICATION_THRESHOLD = 0.80

# Kept in sync with ml-training/scripts/preprocess.py rather than duplicated —
# we dynamically load that file's `preprocess_evidence()` function so both
# training and serving share identical preprocessing logic.
_PREPROCESS_MODULE_PATH = Path(__file__).resolve().parents[2] / "ml-training" / "scripts" / "preprocess.py"


def _load_preprocess_evidence() -> Optional[Callable[[str], dict]]:
    """Best-effort dynamic import of `preprocess_evidence` from ml-training.

    Returns None (never raises) if opencv/numpy aren't installed, the file
    is missing, or import otherwise fails — callers should fall back to the
    stub grading path in that case.
    """
    if not _PREPROCESS_MODULE_PATH.exists():
        logger.warning("preprocess.py not found at %s", _PREPROCESS_MODULE_PATH)
        return None
    try:
        spec = importlib.util.spec_from_file_location("ml_training_preprocess", _PREPROCESS_MODULE_PATH)
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)  # raises ImportError if cv2/numpy missing
        return module.preprocess_evidence
    except ImportError as exc:
        logger.warning(
            "ML deps not installed (%s) -> falling back to stub grading. "
            "TODO: pip install -r requirements-ml.txt and plug in trained weights from ml-training/.",
            exc,
        )
        return None
    except Exception:
        logger.exception("Unexpected error loading preprocess_evidence; falling back to stub grading")
        return None


def _stub_result(attribute_names: list[str], reason: str) -> dict:
    logger.warning(
        "Using deterministic stub grading result (%s). "
        "TODO: pip install -r requirements-ml.txt and plug in trained weights from ml-training/.",
        reason,
    )
    confidence = 0.75  # deliberately below the 80%% threshold -> routes to verification
    scores = {name: confidence for name in attribute_names}
    return {
        "attribute_scores": scores,
        "overall_confidence": confidence,
        "needs_verification": confidence < CONFIDENCE_VERIFICATION_THRESHOLD,
        "method": f"stub-fallback ({reason})",
    }


def _edge_density_proxy(evidence_paths: list[str], preprocess_evidence) -> Optional[float]:
    """Interim heuristic (no trained weights): fewer detected edges is taken
    as fewer visible defects/foreign matter. None if nothing preprocessed."""
    edge_densities: list[float] = []
    for path in evidence_paths:
        try:
            features = preprocess_evidence(path)
            edge_densities.append(features["edge_density"])
        except Exception as exc:
            logger.warning("Failed to preprocess evidence %s: %s", path, exc)
    if not edge_densities:
        return None
    avg_edge_density = sum(edge_densities) / len(edge_densities)
    return round(max(0.0, min(1.0, 1.0 - avg_edge_density)), 4)


def _model_scores(
    evidence_paths: list[str], ml_attribute_names: list[str], vertical_slug: Optional[str]
) -> tuple[dict[str, tuple[float, float]], list[str]]:
    """({attribute: (score, confidence)}, method notes) for attributes a
    trained model covers: the vertical grader first, then any per-attribute
    classifiers for what it doesn't cover."""
    results: dict[str, tuple[float, float]] = {}
    notes: list[str] = []
    grader = load_grader(vertical_slug)
    if grader is not None and grader.attributes & set(ml_attribute_names):
        graded = grader.analyze(evidence_paths)
        if graded is None:
            notes.append(f"{grader.analysis.get('mode')} grader found nothing to classify in the photos")
        else:
            for name in ml_attribute_names:
                if name in graded.scores:
                    results[name] = (graded.scores[name], graded.confidence)
            notes.append(graded.describe())
    for name in ml_attribute_names:
        if name in results:
            continue
        classifier = load_classifier(vertical_slug, name)
        if classifier is None:
            continue
        predictions = []
        for path in evidence_paths:
            try:
                predictions.append(classifier.predict(path))
            except Exception as exc:
                logger.warning("Classifier %s/%s failed on %s: %s", vertical_slug, name, path, exc)
        if predictions:
            combined = combine_predictions(predictions)
            results[name] = (combined.score, combined.confidence)
            notes.append(f"mobilenetv3-small ({name})")
    return results, notes


def grade_attributes(
    evidence_paths: list[str], ml_attribute_names: list[str], vertical_slug: Optional[str] = None
) -> dict:
    """Grade the ML-gradeable attributes for a listing from its evidence images.

    Args:
        evidence_paths: local file paths of uploaded IMAGE evidence for the listing.
        ml_attribute_names: names of attributes flagged `gradeable_by_ml: true`
            in the vertical's grading_schema (§3.1). Non-ML attributes, e.g.
            moisture_content, thread_count, require manual/instrument entry
            and are out of scope here.
        vertical_slug: selects the vertical's trained checkpoints, if any.

    Returns:
        dict with keys: attribute_scores (dict[str, float] in [0, 1]),
        overall_confidence (float in [0, 1]), needs_verification (bool),
        method (str, human-readable description of how scores were derived).
    """
    if not ml_attribute_names:
        return _stub_result([], reason="no ML-gradeable attributes configured for this vertical")

    if not evidence_paths:
        return _stub_result(ml_attribute_names, reason="no image evidence uploaded")

    model_scores, model_notes = _model_scores(evidence_paths, ml_attribute_names, vertical_slug)
    remaining = [name for name in ml_attribute_names if name not in model_scores]

    proxy_score: Optional[float] = None
    if remaining:
        preprocess_evidence = _load_preprocess_evidence()
        if preprocess_evidence is None:
            if not model_scores:
                return _stub_result(ml_attribute_names, reason="requirements-ml.txt not installed")
        else:
            proxy_score = _edge_density_proxy(evidence_paths, preprocess_evidence)
            if proxy_score is None and not model_scores:
                return _stub_result(ml_attribute_names, reason="all evidence files failed to preprocess")

    scores: dict[str, float] = {}
    confidences: list[float] = []
    for name in ml_attribute_names:
        if name in model_scores:
            score, confidence = model_scores[name]
        elif proxy_score is not None:
            # The proxy's score doubles as its confidence (it has no separate
            # notion of certainty) — same as before trained models existed.
            score = confidence = proxy_score
        else:
            score = confidence = 0.75  # stub value, below the threshold -> verifier
        scores[name] = score
        confidences.append(confidence)

    # A listing is only as certain as its least certain attribute: any one
    # shaky attribute should still send it to a human verifier.
    confidence = round(min(confidences), 4)

    fallback = "opencv-heuristic-proxy" if proxy_score is not None else "stub"
    if not model_scores:
        method = "opencv-heuristic-proxy (no trained model for these attributes yet)"
        if model_notes:
            method += "; " + "; ".join(model_notes)
    elif not remaining:
        method = "; ".join(model_notes)
    else:
        method = "; ".join(model_notes) + f"; {fallback} ({', '.join(remaining)})"

    return {
        "attribute_scores": scores,
        "overall_confidence": confidence,
        "needs_verification": confidence < CONFIDENCE_VERIFICATION_THRESHOLD,
        "method": method,
    }
