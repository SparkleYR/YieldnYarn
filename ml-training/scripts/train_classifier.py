"""Fine-tune a MobileNetV3-Small grading classifier.

Data is ImageFolder-style, one directory per class. Either give one directory
and let the script hold out --val-split of it, or (better, avoids leakage
between crops of the same photo) point at a directory with `train/` and `val/`
subdirectories, as `prepare_public_datasets.py` and
`export_verified_dataset.py` produce.

Two outputs, depending on --analysis:

* without it: a single-attribute whole-image classifier,
  checkpoints/<vertical>/<attribute>.pt
* with a JSON analysis config (see configs/): a vertical-level grader,
  checkpoints/<vertical>/grader.pt, that the grading service applies to every
  item (kernel / fabric patch) it finds in an evidence photo.

    # the bundled models:
    python scripts/train_classifier.py --vertical agriculture --data-dir data/agriculture/kernels \\
        --analysis configs/agriculture_grader.json --image-size 128 --epochs 12
    python scripts/train_classifier.py --vertical textiles --data-dir data/textiles/patches \\
        --analysis configs/textiles_grader.json --image-size 96 --grayscale --epochs 8

The class-balanced sampler matters: grain samples are mostly sound kernels and
fabric mostly defect-free, and an unweighted model learns to say "fine" to
everything.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset, WeightedRandomSampler
from torchvision import datasets

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grading_model  # noqa: E402

ML_ROOT = Path(__file__).resolve().parents[1]


def parse_class_scores(value: str | None, classes: list[str]) -> dict[str, float]:
    if not value:
        return grading_model.default_class_scores(classes)
    scores = {}
    for pair in value.split(","):
        name, _, score = pair.partition("=")
        scores[name.strip()] = float(score)
    missing = set(classes) - set(scores)
    if missing:
        raise SystemExit(f"--class-scores is missing classes: {sorted(missing)}")
    return scores


def split_indices(targets: list[int], val_split: float, seed: int) -> tuple[list[int], list[int]]:
    """Stratified split so every class appears in validation."""
    rng = random.Random(seed)
    by_class: dict[int, list[int]] = {}
    for index, target in enumerate(targets):
        by_class.setdefault(target, []).append(index)
    train, val = [], []
    for indices in by_class.values():
        rng.shuffle(indices)
        n_val = max(1, int(len(indices) * val_split)) if len(indices) > 1 else 0
        val.extend(indices[:n_val])
        train.extend(indices[n_val:])
    return train, val


def balanced_sampler(targets: list[int], num_samples: int) -> WeightedRandomSampler:
    counts = torch.bincount(torch.tensor(targets))
    # sqrt-inverse frequency: rare classes are seen far more often, without
    # replaying the ~100 rarest images dozens of times per epoch.
    weights = (1.0 / counts.float().sqrt())[torch.tensor(targets)]
    return WeightedRandomSampler(weights, num_samples=num_samples, replacement=True)


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device, num_classes: int) -> dict:
    model.eval()
    confusion = torch.zeros(num_classes, num_classes, dtype=torch.long)
    with torch.inference_mode():
        for images, labels in loader:
            predictions = model(images.to(device)).argmax(dim=1).cpu()
            for truth, guess in zip(labels.tolist(), predictions.tolist()):
                confusion[truth, guess] += 1
    total = confusion.sum().item()
    per_class_recall = [
        (confusion[i, i].item() / confusion[i].sum().item()) if confusion[i].sum() else None for i in range(num_classes)
    ]
    present = [r for r in per_class_recall if r is not None]
    return {
        "accuracy": confusion.trace().item() / total if total else 0.0,
        # Mean recall over classes present in val: plain accuracy looks great
        # on imbalanced data even when every rare class is missed.
        "balanced_accuracy": sum(present) / len(present) if present else 0.0,
        "per_class_recall": per_class_recall,
        "confusion": confusion.tolist(),
    }


def load_data(args, image_size: int):
    data_dir = Path(args.data_dir or ML_ROOT / "data" / args.vertical / args.attribute)
    train_tf = grading_model.train_transform(image_size, args.grayscale)
    eval_tf = grading_model.eval_transform(image_size, args.grayscale)
    if (data_dir / "train").is_dir() and (data_dir / "val").is_dir():
        train_set = datasets.ImageFolder(data_dir / "train", transform=train_tf)
        val_set = datasets.ImageFolder(data_dir / "val", transform=eval_tf)
        # A class missing from val (too few source photos) keeps train's indices.
        val_set.class_to_idx = train_set.class_to_idx
        val_set.samples = [
            (path, train_set.class_to_idx[Path(path).parent.name]) for path, _ in val_set.samples
        ]
        val_set.targets = [t for _, t in val_set.samples]
        return train_set.classes, train_set, train_set.targets, val_set
    train_view = datasets.ImageFolder(data_dir, transform=train_tf)
    val_view = datasets.ImageFolder(data_dir, transform=eval_tf)
    train_idx, val_idx = split_indices(train_view.targets, args.val_split, args.seed)
    return (
        train_view.classes,
        Subset(train_view, train_idx),
        [train_view.targets[i] for i in train_idx],
        Subset(val_view, val_idx),
    )


def train(args: argparse.Namespace) -> Path:
    analysis = json.loads(Path(args.analysis).read_text()) if args.analysis else None
    default_name = "grader" if analysis else args.attribute
    if not default_name:
        raise SystemExit("--attribute is required without --analysis")
    output = Path(args.output or ML_ROOT / "checkpoints" / args.vertical / f"{default_name}.pt")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(args.seed)

    classes, train_set, train_targets, val_set = load_data(args, args.image_size)
    if len(classes) < 2:
        raise SystemExit(f"Need at least 2 classes, found {classes}")
    class_scores = parse_class_scores(args.class_scores, classes)
    if analysis:
        unknown = {c for spec in analysis.get("attributes", {}).values() for c in spec["bad_classes"]} - set(classes)
        if unknown:
            raise SystemExit(f"Analysis config names classes not in the data: {sorted(unknown)}")

    samples_per_epoch = args.samples_per_epoch or len(train_targets)
    train_loader = DataLoader(
        train_set,
        batch_size=args.batch_size,
        sampler=balanced_sampler(train_targets, samples_per_epoch),
        num_workers=args.workers,
    )
    val_loader = DataLoader(val_set, batch_size=args.batch_size * 2, num_workers=args.workers)
    print(f"{len(train_targets)} train / {len(val_set)} val images, classes={classes}, device={device}")

    model = grading_model.build_model(
        num_classes=len(classes),
        pretrained=not args.no_pretrained,
        arch=args.arch,
        weights_path=args.weights,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=args.lr, total_steps=args.epochs * len(train_loader), pct_start=0.15
    )
    criterion = nn.CrossEntropyLoss(label_smoothing=0.05)

    best, best_metrics = -1.0, None
    for epoch in range(args.epochs):
        model.train()
        started, running_loss = time.time(), 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            scheduler.step()
            running_loss += loss.item()
        metrics = evaluate(model, val_loader, device, len(classes))
        print(
            f"Epoch {epoch + 1}/{args.epochs} ({time.time() - started:.0f}s) — loss {running_loss / len(train_loader):.4f}, "
            f"val acc {metrics['accuracy']:.3f}, balanced {metrics['balanced_accuracy']:.3f}",
            flush=True,
        )
        if metrics["balanced_accuracy"] > best:
            best, best_metrics = metrics["balanced_accuracy"], metrics
            output.parent.mkdir(parents=True, exist_ok=True)
            checkpoint = grading_model.make_checkpoint(
                model.to("cpu"),
                classes,
                class_scores,
                arch=args.arch,
                image_size=args.image_size,
                grayscale=args.grayscale,
                analysis=analysis,
                vertical=args.vertical,
                attribute=args.attribute,
                epoch=epoch + 1,
                train_images=len(train_targets),
                val_images=len(val_set),
                val_metrics=metrics,
                data_dir=str(args.data_dir),
            )
            torch.save(checkpoint, output)
            model.to(device)

    print(f"Saved best checkpoint (val balanced accuracy {best:.3f}) to {output}")
    print("Per-class val recall:", dict(zip(classes, best_metrics["per_class_recall"])))
    return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vertical", required=True, help="Vertical slug, e.g. agriculture")
    parser.add_argument("--attribute", help="Grading attribute for a single-attribute model, e.g. foreign_matter")
    parser.add_argument("--analysis", help="JSON analysis config -> trains a vertical grader (configs/*.json)")
    parser.add_argument("--data-dir", help="Defaults to data/<vertical>/<attribute>")
    parser.add_argument("--output", help="Defaults to checkpoints/<vertical>/{grader|<attribute>}.pt")
    parser.add_argument(
        "--class-scores",
        help="Quality score per class, e.g. '0_clean=1.0,1_minor=0.6,2_heavy=0.1'. "
        "Defaults to evenly spaced 1.0 -> 0.0 in class (alphabetical) order.",
    )
    parser.add_argument("--arch", default=grading_model.ARCHITECTURE)
    parser.add_argument("--weights", help="Local ImageNet weights (.pth) instead of downloading them")
    parser.add_argument("--image-size", type=int, default=grading_model.IMAGE_SIZE)
    parser.add_argument("--grayscale", action="store_true", help="Train/serve on greyscale (e.g. TILDA fabric)")
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--samples-per-epoch", type=int, help="Defaults to the train set size")
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--val-split", type=float, default=0.2, help="Only without train/ and val/ subdirectories")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-pretrained", action="store_true", help="Start from random weights (testing only)")
    return parser


if __name__ == "__main__":
    train(build_parser().parse_args())
