"""Model definition, checkpoint format and sample analysis, shared by training and serving.

`train_classifier.py` builds and saves models through this module, and
`backend-fastapi/grading/classifier.py` loads it dynamically (the same way it
loads `preprocess.py`) to rebuild the identical network, input transform and
analysis at inference time — so a checkpoint can never be served differently
from how it was trained and evaluated.

Two kinds of checkpoint live under `checkpoints/<vertical_slug>/`:

* `grader.pt` — a vertical-level grader. Its `analysis` block says how to turn
  an evidence photo into many small classification inputs and how to turn the
  per-item predictions into attribute scores:

    - mode "kernels" (agriculture): segment the individual kernels/particles
      of a grain sample spread on a plain background, classify each one, and
      score attributes from the share of bad items (e.g. foreign_matter from
      the share classified as foreign particles).
    - mode "patches" (textiles): tile the fabric photo into small patches,
      classify each, and score attributes from the share of defective patches.

* `<attribute>.pt` — a single-attribute whole-image classifier (mode "image",
  the original format). Score = probability-weighted class score.

Attribute scores are in [0, 1] (1 = best). For share-based attributes,
score = clip(1 - bad_share / tolerance, 0, 1): `tolerance` is the bad share at
which the attribute bottoms out (e.g. 10% foreign particles by count).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

CHECKPOINT_FORMAT_VERSION = 2
ARCHITECTURE = "timm:mobilenetv3_small_100"
LEGACY_ARCHITECTURE = "mobilenet_v3_small"  # torchvision; format v1 checkpoints
IMAGE_SIZE = 224
IMAGENET_MEAN = (0.485, 0.456, 0.406)
IMAGENET_STD = (0.229, 0.224, 0.225)

# ImageNet-pretrained weights for the timm architecture, published on GitHub
# releases by timm's author (the torchvision/Hugging Face mirrors aren't
# always reachable from build machines).
PRETRAINED_WEIGHTS_URL = (
    "https://github.com/rwightman/pytorch-image-models/releases/download/"
    "v0.1-weights/mobilenetv3_small_100_lamb-266a294c.pth"
)


# --- model ---------------------------------------------------------------


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


def build_model(num_classes: int, pretrained: bool = True, arch: str = ARCHITECTURE, weights_path: Optional[str] = None):
    """`weights_path` (a local .pth) overrides downloading PRETRAINED_WEIGHTS_URL."""
    if arch == LEGACY_ARCHITECTURE:
        from torch import nn
        from torchvision import models

        weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
        model = models.mobilenet_v3_small(weights=weights)
        model.classifier[-1] = nn.Linear(model.classifier[-1].in_features, num_classes)
        return model

    if not arch.startswith("timm:"):
        raise ValueError(f"Unsupported architecture {arch!r}")
    import timm
    import torch

    model = timm.create_model(arch.split(":", 1)[1], pretrained=False)
    if pretrained:
        if weights_path:
            state = torch.load(weights_path, map_location="cpu", weights_only=True)
        else:
            state = torch.hub.load_state_dict_from_url(PRETRAINED_WEIGHTS_URL, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
    model.reset_classifier(num_classes)
    return model


def eval_transform(image_size: int = IMAGE_SIZE, grayscale: bool = False):
    from torchvision import transforms

    steps = [transforms.Resize((image_size, image_size))]
    if grayscale:
        steps.append(transforms.Grayscale(num_output_channels=3))
    steps += [transforms.ToTensor(), transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD)]
    return transforms.Compose(steps)


def train_transform(image_size: int = IMAGE_SIZE, grayscale: bool = False):
    """Geometric augmentation plus colour jitter. The hue/saturation jitter is
    deliberately small but not zero: phone cameras' white balance varies a lot
    between photos (the wheat data has whole photos with a blue cast), and a
    model that keys on exact colour fails on the next phone."""
    from torchvision import transforms

    steps = [
        transforms.RandomResizedCrop(image_size, scale=(0.75, 1.0), ratio=(0.8, 1.25)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(),
        transforms.RandomRotation(90),
        transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.3, hue=0.05),
    ]
    if grayscale:
        steps.append(transforms.Grayscale(num_output_channels=3))
    steps += [transforms.ToTensor(), transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD)]
    return transforms.Compose(steps)


def make_checkpoint(
    model,
    classes: list[str],
    class_scores: dict[str, float],
    *,
    arch: str = ARCHITECTURE,
    image_size: int = IMAGE_SIZE,
    grayscale: bool = False,
    analysis: Optional[dict] = None,
    **metadata,
) -> dict:
    return {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "arch": arch,
        "image_size": image_size,
        "grayscale": grayscale,
        "model_state": model.state_dict(),
        "classes": list(classes),
        "class_scores": {name: float(class_scores[name]) for name in classes},
        "analysis": analysis or {"mode": "image"},
        "metadata": metadata,
    }


def load_checkpoint_model(checkpoint: dict):
    """Rebuild an eval-mode model from a checkpoint dict (no pretrained download)."""
    arch = checkpoint.get("arch", LEGACY_ARCHITECTURE)
    model = build_model(num_classes=len(checkpoint["classes"]), pretrained=False, arch=arch)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    return model


# --- sample analysis -----------------------------------------------------


@dataclass
class Item:
    """One classification input cut from an evidence photo."""

    image: "object"  # PIL.Image
    box: tuple[int, int, int, int]  # x0, y0, x1, y1 in the source photo


def strip_halo(crop, px: int = 3, min_keep: float = 0.3, min_pixels: int = 30):
    """Erode a masked crop (black = background) by `px` pixels.

    Thresholding leaves a ring of background colour around each particle
    whose thickness depends on focus and lighting; left in, a model learns
    "how much background shows" instead of what the particle is. Eroding is
    colour-agnostic, so it behaves the same whatever sheet the grain is on.
    Returns None when little survives: the component was mostly background
    (a segmentation artefact), not a particle.
    """
    import cv2
    import numpy as np

    present = (crop.reshape(-1, 3).sum(1) > 0).reshape(crop.shape[:2]).astype(np.uint8)
    if present.sum() == 0:
        return None
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px + 1, 2 * px + 1))
    keep = cv2.erode(present, kernel)
    if keep.sum() < max(min_pixels, min_keep * present.sum()):
        return None
    crop = crop.copy()
    crop[keep == 0] = 0
    return crop


def segment_kernels(image, max_side: int = 1600, min_area_frac: float = 0.15) -> list[Item]:
    """Cut individual kernels/particles out of a photo of a grain sample.

    Mirrors how the training crops were made: threshold the red channel with
    Otsu, take connected components, paste each component onto black, and
    strip the background-coloured halo (`strip_halo`).
    The background may be darker or lighter than the grain — whichever side of
    the threshold covers less of the photo is treated as foreground. Tiny
    specks (below `min_area_frac` × the median component area) are dropped as
    noise; very large components (touching kernels) are kept, since the
    classifier still sees them.
    """
    import cv2
    import numpy as np
    from PIL import Image

    rgb = np.asarray(image.convert("RGB"))
    scale = min(1.0, max_side / max(rgb.shape[:2]))
    if scale < 1.0:
        rgb = cv2.resize(rgb, (int(rgb.shape[1] * scale), int(rgb.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    red = cv2.GaussianBlur(rgb[:, :, 0], (5, 5), 0)
    _, mask = cv2.threshold(red, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if mask.mean() > 127:  # foreground should be the minority
        mask = 255 - mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return []

    areas = stats[1:, cv2.CC_STAT_AREA]
    median = float(np.median(areas[areas >= 20])) if (areas >= 20).any() else 0.0
    if median <= 0:
        return []

    items: list[Item] = []
    h, w = mask.shape
    for index in range(1, count):
        x, y, bw, bh, area = stats[index]
        if area < max(20, min_area_frac * median):
            continue
        pad = 3
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)
        crop = rgb[y0:y1, x0:x1].copy()
        crop[labels[y0:y1, x0:x1] != index] = 0
        crop = strip_halo(crop)
        if crop is not None:
            items.append(Item(Image.fromarray(crop), (x0, y0, x1, y1)))
    return items


def tile_patches(image, patch: int = 64, stride: int = 64, long_side: int = 768) -> list[Item]:
    """Cut a fabric photo into a grid of square patches (after resizing so
    its long side is `long_side`, the scale the model was trained at)."""
    from PIL import Image

    img = image.convert("RGB")
    scale = long_side / max(img.size)
    img = img.resize((max(patch, round(img.width * scale)), max(patch, round(img.height * scale))), Image.BILINEAR)
    items = []
    for y in range(0, img.height - patch + 1, stride):
        for x in range(0, img.width - patch + 1, stride):
            items.append(Item(img.crop((x, y, x + patch, y + patch)), (x, y, x + patch, y + patch)))
    return items


def items_for(image, analysis: dict) -> list[Item]:
    mode = analysis.get("mode", "image")
    if mode == "kernels":
        return segment_kernels(image, **analysis.get("segmentation", {}))
    if mode == "patches":
        return tile_patches(image, **analysis.get("tiling", {}))
    return [Item(image.convert("RGB"), (0, 0, image.width, image.height))]


def share_scores(labels: Sequence[str], analysis: dict) -> dict[str, dict]:
    """Per-attribute {score, bad_share, counted} from per-item predicted labels.

    Each attribute definition: {"bad_classes": [...], "tolerance": 0.1,
    "of_classes": [...optional; which items count toward the denominator]}.
    """
    results = {}
    for name, spec in analysis.get("attributes", {}).items():
        pool = [label for label in labels if not spec.get("of_classes") or label in spec["of_classes"]]
        if not pool:
            continue
        bad = sum(1 for label in pool if label in spec["bad_classes"])
        share = bad / len(pool)
        results[name] = {
            "score": round(max(0.0, min(1.0, 1.0 - share / spec["tolerance"])), 4),
            "bad_share": round(share, 4),
            "counted": len(pool),
        }
    return results
