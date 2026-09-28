"""Fine-tune a MobileNetV3-Small classifier for one grading attribute.

Expects an ImageFolder layout — one directory per quality bucket:

    data/<vertical>/<attribute>/<class>/*.jpg
    e.g. data/agriculture/foreign_matter/{0_clean,1_minor,2_heavy}/*.jpg

(`export_verified_dataset.py` produces exactly this from verifier-confirmed
listings.) Holds out --val-split of the images, keeps the checkpoint with the
best validation accuracy, and writes it where the grading service looks for
it: checkpoints/<vertical>/<attribute>.pt. See implementation_plan.md §9.3.

    python scripts/train_classifier.py --vertical agriculture --attribute foreign_matter
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader, Subset
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


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> float:
    model.eval()
    correct = total = 0
    with torch.inference_mode():
        for images, labels in loader:
            predictions = model(images.to(device)).argmax(dim=1)
            correct += (predictions == labels.to(device)).sum().item()
            total += labels.numel()
    return correct / total if total else 0.0


def train(args: argparse.Namespace) -> Path:
    data_dir = Path(args.data_dir or ML_ROOT / "data" / args.vertical / args.attribute)
    output = Path(args.output or ML_ROOT / "checkpoints" / args.vertical / f"{args.attribute}.pt")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.manual_seed(args.seed)

    train_view = datasets.ImageFolder(data_dir, transform=grading_model.train_transform())
    val_view = datasets.ImageFolder(data_dir, transform=grading_model.eval_transform())
    classes = train_view.classes
    if len(classes) < 2:
        raise SystemExit(f"Need at least 2 class directories under {data_dir}, found {classes}")
    class_scores = parse_class_scores(args.class_scores, classes)

    train_idx, val_idx = split_indices(train_view.targets, args.val_split, args.seed)
    train_loader = DataLoader(
        Subset(train_view, train_idx), batch_size=args.batch_size, shuffle=True, num_workers=args.workers
    )
    val_loader = DataLoader(Subset(val_view, val_idx), batch_size=args.batch_size, num_workers=args.workers)
    print(f"{len(train_idx)} train / {len(val_idx)} val images, classes={classes}, device={device}")

    model = grading_model.build_model(num_classes=len(classes), pretrained=not args.no_pretrained).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss()

    best_accuracy = -1.0
    for epoch in range(args.epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            loss = criterion(model(images), labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
        scheduler.step()
        accuracy = evaluate(model, val_loader, device) if val_idx else 0.0
        print(
            f"Epoch {epoch + 1}/{args.epochs} — loss {running_loss / max(len(train_loader), 1):.4f}, "
            f"val accuracy {accuracy:.3f}"
        )
        if accuracy > best_accuracy:
            best_accuracy = accuracy
            output.parent.mkdir(parents=True, exist_ok=True)
            checkpoint = grading_model.make_checkpoint(
                model.to("cpu"),
                classes,
                class_scores,
                vertical=args.vertical,
                attribute=args.attribute,
                val_accuracy=accuracy,
                epoch=epoch + 1,
                train_images=len(train_idx),
                val_images=len(val_idx),
            )
            torch.save(checkpoint, output)
            model.to(device)

    print(f"Saved best checkpoint (val accuracy {best_accuracy:.3f}) to {output}")
    return output


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vertical", required=True, help="Vertical slug, e.g. agriculture")
    parser.add_argument("--attribute", required=True, help="Grading attribute, e.g. foreign_matter")
    parser.add_argument("--data-dir", help="Defaults to data/<vertical>/<attribute>")
    parser.add_argument("--output", help="Defaults to checkpoints/<vertical>/<attribute>.pt")
    parser.add_argument(
        "--class-scores",
        help="Quality score per class, e.g. '0_clean=1.0,1_minor=0.6,2_heavy=0.1'. "
        "Defaults to evenly spaced 1.0 -> 0.0 in class (alphabetical) order.",
    )
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--val-split", type=float, default=0.2)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-pretrained", action="store_true", help="Start from random weights (testing only)")
    return parser


if __name__ == "__main__":
    train(build_parser().parse_args())
