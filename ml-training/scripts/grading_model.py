"""Model definition + checkpoint format shared by training and serving.

`train_classifier.py` builds and saves models through this module, and
`backend-fastapi/grading/classifier.py` loads it dynamically (the same way it
loads `preprocess.py`) to rebuild the identical network and input transform
at inference time — so a checkpoint can never be served with a different
architecture or normalization than it was trained with.

One checkpoint grades one attribute of one vertical and lives at
`checkpoints/<vertical_slug>/<attribute>.pt`, e.g.
`checkpoints/agriculture/foreign_matter.pt`. Its classes are quality buckets
(e.g. `clean`, `minor`, `heavy`), each mapped to a score in [0, 1] via
`class_scores`; the served attribute score is the probability-weighted
average of those scores, and the confidence is the top class probability.
"""
from __future__ import annotations

CHECKPOINT_FORMAT_VERSION = 1
ARCHITECTURE = "mobilenet_v3_small"
IMAGE_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)


def default_class_scores(classes: list[str]) -> dict[str, float]:
    """Evenly spaced scores from 1.0 (first class) down to 0.0 (last class).

    ImageFolder orders classes alphabetically, so name bucket directories
    best-to-worst in sort order (e.g. `0_clean`, `1_minor`, `2_heavy`) or pass
    explicit scores to train_classifier.py with --class-scores.
    """
    if len(classes) == 1:
        return {classes[0]: 1.0}
    step = 1.0 / (len(classes) - 1)
    return {name: round(1.0 - i * step, 4) for i, name in enumerate(classes)}


def build_model(num_classes: int, pretrained: bool = True):
    from torch import nn
    from torchvision import models

    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
    model = models.mobilenet_v3_small(weights=weights)
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    return model


def eval_transform(image_size: int = IMAGE_SIZE):
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )


def train_transform(image_size: int = IMAGE_SIZE):
    """Light augmentation only — evidence photos vary in framing and lighting,
    but hue shifts would corrupt color-based quality cues (e.g. discolored grain)."""
    from torchvision import transforms

    return transforms.Compose(
        [
            transforms.RandomResizedCrop(image_size, scale=(0.7, 1.0)),
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
        ]
    )


def make_checkpoint(model, classes: list[str], class_scores: dict[str, float], **metadata) -> dict:
    return {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "arch": ARCHITECTURE,
        "image_size": IMAGE_SIZE,
        "model_state": model.state_dict(),
        "classes": list(classes),
        "class_scores": {name: float(class_scores[name]) for name in classes},
        "metadata": metadata,
    }


def load_checkpoint_model(checkpoint: dict):
    """Rebuild an eval-mode model from a checkpoint dict (no pretrained download)."""
    if checkpoint.get("arch", ARCHITECTURE) != ARCHITECTURE:
        raise ValueError(f"Unsupported architecture {checkpoint.get('arch')!r}; expected {ARCHITECTURE!r}")
    model = build_model(num_classes=len(checkpoint["classes"]), pretrained=False)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model
