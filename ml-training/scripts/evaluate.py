"""Evaluate a grading checkpoint on a held-out ImageFolder dataset (§10.2).

Reports accuracy, a confusion matrix, and — the number that matters for
operations — how many listings would be auto-approved vs. routed to a human
verifier at the service's 80% confidence threshold, and how accurate the
auto-approved ones are.

    python scripts/evaluate.py checkpoints/agriculture/foreign_matter.pt data/holdout/agriculture/foreign_matter
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader
from torchvision import datasets

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grading_model  # noqa: E402

CONFIDENCE_VERIFICATION_THRESHOLD = 0.80  # mirrors backend-fastapi/grading/pipeline.py


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("checkpoint")
    parser.add_argument("data_dir")
    parser.add_argument("--threshold", type=float, default=CONFIDENCE_VERIFICATION_THRESHOLD)
    args = parser.parse_args()

    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    classes = checkpoint["classes"]
    model = grading_model.load_checkpoint_model(checkpoint)
    dataset = datasets.ImageFolder(args.data_dir, transform=grading_model.eval_transform(checkpoint["image_size"]))
    if dataset.classes != classes:
        raise SystemExit(f"Holdout classes {dataset.classes} don't match checkpoint classes {classes}")

    n = len(classes)
    confusion = [[0] * n for _ in range(n)]
    auto_total = auto_correct = 0
    with torch.inference_mode():
        for images, labels in DataLoader(dataset, batch_size=32):
            probabilities = torch.softmax(model(images), dim=1)
            confidence, predicted = probabilities.max(dim=1)
            for truth, guess, conf in zip(labels.tolist(), predicted.tolist(), confidence.tolist()):
                confusion[truth][guess] += 1
                if conf >= args.threshold:
                    auto_total += 1
                    auto_correct += int(truth == guess)

    total = sum(map(sum, confusion))
    correct = sum(confusion[i][i] for i in range(n))
    print(f"Images: {total}   accuracy: {correct / total:.3f}")
    print("\nConfusion matrix (rows = truth, cols = predicted):")
    width = max(len(c) for c in classes)
    print(" " * (width + 2) + "  ".join(f"{c[:8]:>8}" for c in classes))
    for name, row in zip(classes, confusion):
        print(f"{name:>{width}}  " + "  ".join(f"{v:>8}" for v in row))
    print(
        f"\nAt threshold {args.threshold:.2f}: {auto_total}/{total} auto-graded "
        f"({auto_total / total:.1%}), {total - auto_total} routed to verifiers"
    )
    if auto_total:
        print(f"Accuracy of auto-graded images: {auto_correct / auto_total:.3f}")


if __name__ == "__main__":
    main()
