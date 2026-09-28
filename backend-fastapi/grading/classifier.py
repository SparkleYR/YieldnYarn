"""Serving side of the fine-tuned grading models (implementation_plan.md §9.3).

Loads checkpoints produced by `ml-training/scripts/train_classifier.py` from
`<GRADING_MODELS_DIR>/<vertical_slug>/`, rebuilding network, input transform
and sample analysis through `ml-training/scripts/grading_model.py` so training
and serving can't drift apart:

* `grader.pt` — a vertical grader (`load_grader`): finds many items in each
  evidence photo (wheat kernels, fabric patches), classifies every one, and
  scores several attributes from the share of bad items.
* `<attribute>.pt` — a single-attribute whole-image classifier (`load_classifier`).

torch/torchvision/timm (requirements-ml.txt) are imported lazily: without
them, or without a checkpoint, these return None and grading/pipeline.py falls
back to its heuristic path.

The scoring math (`score_probabilities`) is plain Python so it's testable
without the ML stack installed.
"""
from __future__ import annotations

import importlib.util
import logging
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Optional, Sequence

logger = logging.getLogger("grading.classifier")

_REPO_ROOT = Path(__file__).resolve().parents[2]
_MODEL_MODULE_PATH = _REPO_ROOT / "ml-training" / "scripts" / "grading_model.py"
_DEFAULT_MODELS_DIR = _REPO_ROOT / "ml-training" / "checkpoints"


@dataclass(frozen=True)
class Prediction:
    score: float  # attribute quality in [0, 1] (1 = best)
    confidence: float  # top-class probability in [0, 1]
    label: str  # top class


def score_probabilities(
    probabilities: Sequence[float], classes: Sequence[str], class_scores: dict[str, float]
) -> Prediction:
    """Probability-weighted quality score + top-class confidence."""
    if len(probabilities) != len(classes) or not classes:
        raise ValueError("probabilities and classes must be the same, non-zero length")
    total = sum(probabilities)
    probs = [p / total for p in probabilities] if total > 0 else [1.0 / len(classes)] * len(classes)
    score = sum(p * class_scores[name] for p, name in zip(probs, classes))
    top = max(range(len(classes)), key=lambda i: probs[i])
    return Prediction(
        score=round(min(max(score, 0.0), 1.0), 4),
        confidence=round(probs[top], 4),
        label=classes[top],
    )


def combine_predictions(predictions: Sequence[Prediction]) -> Prediction:
    """Several evidence photos of one listing -> one attribute prediction."""
    if not predictions:
        raise ValueError("no predictions to combine")
    labels = [p.label for p in predictions]
    return Prediction(
        score=round(mean(p.score for p in predictions), 4),
        confidence=round(mean(p.confidence for p in predictions), 4),
        label=max(set(labels), key=labels.count),
    )


def models_dir() -> Path:
    from db import settings

    return Path(settings.GRADING_MODELS_DIR) if settings.GRADING_MODELS_DIR else _DEFAULT_MODELS_DIR


def checkpoint_path(vertical_slug: str, attribute: str) -> Path:
    return models_dir() / vertical_slug / f"{attribute}.pt"


@dataclass(frozen=True)
class GraderResult:
    """Output of a vertical grader over all of a listing's photos."""

    scores: dict[str, float]  # attribute -> score in [0, 1]
    confidence: float
    items: int  # kernels / patches classified
    details: dict[str, dict]  # attribute -> {score, bad_share, counted}
    mode: str

    def describe(self) -> str:
        noun = {"kernels": "particles", "patches": "fabric patches"}.get(self.mode, "items")
        parts = [f"{name} {d['bad_share'] * 100:.1f}% bad" for name, d in sorted(self.details.items())]
        return f"mobilenetv3-small {self.mode} grader: {self.items} {noun} classified; " + ", ".join(parts)


class VerticalGrader:
    BATCH = 64

    def __init__(
        self,
        model,
        classes: list[str],
        transform,
        analysis: dict,
        grading_model,
        torch_module,
        confidence_cap: float = 1.0,
    ):
        self._model = model
        self.classes = classes
        self._transform = transform
        self.analysis = analysis
        # A model can't be more sure of a sample than it proved to be on
        # held-out photos: its validated balanced accuracy caps the confidence
        # it reports, so a weak model routes to verifiers instead of
        # auto-approving listings.
        self.confidence_cap = confidence_cap
        self._gm = grading_model
        self._torch = torch_module

    @property
    def attributes(self) -> set[str]:
        return set(self.analysis.get("attributes", {}))

    def _classify(self, images) -> list[tuple[str, float]]:
        results = []
        with self._torch.inference_mode():
            for start in range(0, len(images), self.BATCH):
                batch = self._torch.stack([self._transform(img) for img in images[start : start + self.BATCH]])
                probs = self._torch.softmax(self._model(batch), dim=1)
                results += [self._gm.decide(row, self.classes, self.analysis) for row in probs.tolist()]
        return results

    def analyze(self, image_paths: list[str]) -> Optional[GraderResult]:
        """None when no photo yields anything to classify (e.g. no kernels found)."""
        from PIL import Image

        predictions: list[tuple[str, float]] = []
        for path in image_paths:
            try:
                with Image.open(path) as img:
                    items = self._gm.items_for(img, self.analysis)
                    predictions += self._classify([item.image for item in items])
            except Exception as exc:
                logger.warning("Grader failed on %s: %s", path, exc)
        if not predictions:
            return None
        labels = [label for label, _ in predictions]
        details = self._gm.share_scores(labels, self.analysis)
        if not details:
            return None
        # Fewer items than the config expects (a close-up, a clump of grain)
        # means a less representative sample: scale confidence down so it
        # goes to a verifier.
        coverage = min(1.0, len(predictions) / self.analysis.get("min_items", 1))
        confidence = round(min(mean(p for _, p in predictions) * coverage, self.confidence_cap), 4)
        return GraderResult(
            scores={name: d["score"] for name, d in details.items()},
            confidence=confidence,
            items=len(predictions),
            details=details,
            mode=self.analysis.get("mode", "image"),
        )


class AttributeClassifier:
    def __init__(self, model, classes: list[str], class_scores: dict[str, float], transform, torch_module):
        self._model = model
        self.classes = classes
        self.class_scores = class_scores
        self._transform = transform
        self._torch = torch_module

    def predict(self, image_path: str) -> Prediction:
        from PIL import Image

        with Image.open(image_path) as img:
            batch = self._transform(img.convert("RGB")).unsqueeze(0)
        with self._torch.inference_mode():
            logits = self._model(batch)
            probabilities = self._torch.softmax(logits, dim=1)[0].tolist()
        return score_probabilities(probabilities, self.classes, self.class_scores)


_cache_lock = threading.Lock()
# path -> (mtime, classifier-or-None); mtime lets a retrained checkpoint
# dropped in place be picked up without restarting the service.
_cache: dict[Path, tuple[float, object]] = {}


def _load_model_module():
    name = "ml_training_grading_model"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _MODEL_MODULE_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {_MODEL_MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    # Registered before executing: @dataclass (grading_model.Item) resolves
    # its own module through sys.modules and fails without it.
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        del sys.modules[name]
        raise
    return module


def _load_checkpoint(path: Path, build):
    """Load + build once per file version (mtime), so a retrained checkpoint
    dropped in place is picked up without restarting the service."""
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    with _cache_lock:
        cached = _cache.get(path)
        if cached is not None and cached[0] == mtime:
            return cached[1]
        loaded = None
        try:
            import torch

            grading_model = _load_model_module()
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            loaded = build(checkpoint, grading_model, torch)
            logger.info("Loaded grading checkpoint %s (classes=%s)", path, checkpoint["classes"])
        except ImportError as exc:
            logger.warning("Checkpoint %s present but ML deps missing (%s); using fallback grading", path, exc)
        except Exception:
            logger.exception("Failed to load grading checkpoint %s; using fallback grading", path)
        _cache[path] = (mtime, loaded)
        return loaded


def _transform_for(checkpoint: dict, grading_model):
    return grading_model.eval_transform(
        checkpoint.get("image_size", grading_model.IMAGE_SIZE), checkpoint.get("grayscale", False)
    )


def _validated_cap(checkpoint: dict) -> float:
    metrics = (checkpoint.get("metadata") or {}).get("val_metrics") or {}
    value = metrics.get("balanced_accuracy")
    return float(value) if isinstance(value, (int, float)) and value > 0 else 1.0


def load_grader(vertical_slug: Optional[str]) -> Optional[VerticalGrader]:
    """The vertical's multi-attribute grader (`grader.pt`), if one is installed."""
    if not vertical_slug:
        return None

    def build(checkpoint, grading_model, torch):
        return VerticalGrader(
            model=grading_model.load_checkpoint_model(checkpoint),
            classes=list(checkpoint["classes"]),
            transform=_transform_for(checkpoint, grading_model),
            analysis=checkpoint.get("analysis") or {"mode": "image"},
            grading_model=grading_model,
            torch_module=torch,
            confidence_cap=_validated_cap(checkpoint),
        )

    return _load_checkpoint(models_dir() / vertical_slug / "grader.pt", build)


def load_classifier(vertical_slug: Optional[str], attribute: str) -> Optional[AttributeClassifier]:
    """The trained single-attribute classifier for this vertical/attribute, or
    None if there isn't one (no checkpoint yet, ML deps missing, or a corrupt file)."""
    if not vertical_slug:
        return None

    def build(checkpoint, grading_model, torch):
        classes = list(checkpoint["classes"])
        return AttributeClassifier(
            model=grading_model.load_checkpoint_model(checkpoint),
            classes=classes,
            class_scores=checkpoint.get("class_scores") or grading_model.default_class_scores(classes),
            transform=_transform_for(checkpoint, grading_model),
            torch_module=torch,
        )

    return _load_checkpoint(checkpoint_path(vertical_slug, attribute), build)
