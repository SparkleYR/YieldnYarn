"""Serving side of the fine-tuned grading classifiers (implementation_plan.md §9.3).

Loads `<GRADING_MODELS_DIR>/<vertical_slug>/<attribute>.pt` checkpoints
produced by `ml-training/scripts/train_classifier.py`, rebuilding the network
through `ml-training/scripts/grading_model.py` so training and serving can't
drift apart. torch/torchvision (requirements-ml.txt) are imported lazily:
without them, or without a checkpoint for an attribute, `load_classifier`
returns None and grading/pipeline.py falls back to its heuristic path.

The scoring math (`score_probabilities`) is plain Python so it's testable
without the ML stack installed.
"""
from __future__ import annotations

import importlib.util
import logging
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
_cache: dict[Path, tuple[float, Optional[AttributeClassifier]]] = {}


def _load_model_module():
    spec = importlib.util.spec_from_file_location("ml_training_grading_model", _MODEL_MODULE_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {_MODEL_MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_classifier(vertical_slug: Optional[str], attribute: str) -> Optional[AttributeClassifier]:
    """The trained classifier for this vertical/attribute, or None if there
    isn't one (no checkpoint yet, ML deps missing, or a corrupt file)."""
    if not vertical_slug:
        return None
    path = checkpoint_path(vertical_slug, attribute)
    if not path.exists():
        return None
    mtime = path.stat().st_mtime

    with _cache_lock:
        cached = _cache.get(path)
        if cached is not None and cached[0] == mtime:
            return cached[1]

        classifier: Optional[AttributeClassifier] = None
        try:
            import torch

            grading_model = _load_model_module()
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            classes = list(checkpoint["classes"])
            class_scores = checkpoint.get("class_scores") or grading_model.default_class_scores(classes)
            classifier = AttributeClassifier(
                model=grading_model.load_checkpoint_model(checkpoint),
                classes=classes,
                class_scores=class_scores,
                transform=grading_model.eval_transform(checkpoint.get("image_size", grading_model.IMAGE_SIZE)),
                torch_module=torch,
            )
            logger.info("Loaded grading classifier %s (classes=%s)", path, classes)
        except ImportError as exc:
            logger.warning("Checkpoint %s present but ML deps missing (%s); using fallback grading", path, exc)
        except Exception:
            logger.exception("Failed to load grading checkpoint %s; using fallback grading", path)

        _cache[path] = (mtime, classifier)
        return classifier
