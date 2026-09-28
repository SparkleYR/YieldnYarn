"""Sample-level evaluation of a vertical grader (checkpoints/<vertical>/grader.pt).

Per-item accuracy (what train_classifier.py reports) isn't what a seller sees:
the grade comes from the *share* of bad items the grader finds in a whole
photo. This runs the exact serving pipeline — grading_model.items_for() to
segment/tile, the checkpoint's classifier, grading_model.share_scores() — on
held-out data and reports how close the estimated shares get to the truth.

* kernels mode: composes synthetic sample photos from held-out kernel crops
  (data/<vertical>/kernels/val) scattered on a green sheet like the source
  photos, with known foreign/damaged shares, and compares.
* patches mode: tiles the held-out TILDA photos and compares the predicted
  defective share with the share derived from their bounding boxes.

    python scripts/evaluate_grader.py checkpoints/agriculture/grader.pt --data-dir data/agriculture/kernels/val
    python scripts/evaluate_grader.py checkpoints/textiles/grader.pt --tilda-dir external/tilda/dataset
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from statistics import mean

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grading_model  # noqa: E402


class Grader:
    def __init__(self, checkpoint_path: str):
        self.ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
        self.model = grading_model.load_checkpoint_model(self.ckpt)
        self.classes = self.ckpt["classes"]
        self.analysis = self.ckpt["analysis"]
        self.transform = grading_model.eval_transform(self.ckpt["image_size"], self.ckpt.get("grayscale", False))

    def labels(self, image) -> list[str]:
        items = grading_model.items_for(image, self.analysis)
        if not items:
            return []
        with torch.inference_mode():
            batch = torch.stack([self.transform(item.image) for item in items])
            index = self.model(batch).argmax(dim=1).tolist()
        return [self.classes[i] for i in index]


def compose_sample(crops: list, rng: random.Random, size: int = 1200):
    """Scatter crops (black background) on a green sheet without overlaps."""
    from PIL import Image

    sheet = Image.new("RGB", (size, size), (70, 125, 40))
    placed = []
    for crop in crops:
        img = crop.rotate(rng.choice([0, 90, 180, 270]), expand=True)
        for _ in range(60):
            x, y = rng.randint(0, size - img.width), rng.randint(0, size - img.height)
            box = (x - 12, y - 12, x + img.width + 12, y + img.height + 12)
            if all(box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3] for b in placed):
                mask = img.convert("L").point(lambda v: 255 if v > 10 else 0)
                sheet.paste(img, (x, y), mask)
                placed.append(box)
                break
    return sheet, len(placed)


def evaluate_kernels(grader: Grader, data_dir: Path, samples: int, seed: int) -> dict:
    from PIL import Image

    rng = random.Random(seed)
    by_class = {d.name: sorted(d.glob("*.png")) for d in data_dir.iterdir() if d.is_dir()}
    attrs = grader.analysis["attributes"]
    errors = {name: [] for name in attrs}
    counts = []
    for _ in range(samples):
        n = rng.randint(40, 80)
        foreign_share = rng.choice([0.0, 0.02, 0.05, 0.1, 0.2])
        damaged_share = rng.choice([0.0, 0.1, 0.25, 0.4])
        n_foreign = round(n * foreign_share)
        n_damaged = round((n - n_foreign) * damaged_share)
        n_sound = n - n_foreign - n_damaged
        picks = (
            [("2_foreign", p) for p in rng.sample(by_class["2_foreign"], n_foreign)]
            + [("1_damaged", p) for p in rng.sample(by_class["1_damaged"], n_damaged)]
            + [("0_sound", p) for p in rng.sample(by_class["0_sound"], n_sound)]
        )
        rng.shuffle(picks)
        sheet, placed = compose_sample([Image.open(p).convert("RGB") for _, p in picks], rng)
        truth_labels = [cls for cls, _ in picks[:placed]]
        predicted = grader.labels(sheet)
        counts.append((len(predicted), placed))
        truth = grading_model.share_scores(truth_labels, grader.analysis)
        guess = grading_model.share_scores(predicted, grader.analysis)
        for name in attrs:
            if name in truth and name in guess:
                errors[name].append(abs(truth[name]["bad_share"] - guess[name]["bad_share"]))
    return {
        "samples": samples,
        "segmentation_found_vs_placed": round(mean(f / p for f, p in counts), 3),
        "mean_abs_share_error": {name: round(mean(v), 4) for name, v in errors.items() if v},
    }


def evaluate_patches(grader: Grader, tilda_dir: Path) -> dict:
    """Patch-level good-vs-defect agreement on held-out TILDA photos, using the
    same 64px grid the grader tiles with and the photos' bounding boxes."""
    from PIL import Image

    tiling = grader.analysis.get("tiling", {})
    patch, stride, long_side = tiling.get("patch", 64), tiling.get("stride", 64), tiling.get("long_side", 768)
    bad = set(next(iter(grader.analysis["attributes"].values()))["bad_classes"])
    tp = fp = fn = tn = 0
    images_flagged = images = 0
    share_errors = []
    for image_path in sorted((tilda_dir / "images" / "val").glob("*.jpg")):
        image = Image.open(image_path)
        scale = long_side / max(image.size)
        w, h = round(image.width * scale), round(image.height * scale)
        boxes = []
        label_path = tilda_dir / "labels" / "val" / f"{image_path.stem}.txt"
        for line in label_path.read_text().split("\n") if label_path.exists() else []:
            parts = line.split()
            if len(parts) == 5:
                _, cx, cy, bw, bh = map(float, parts)
                boxes.append(((cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h))
        truth = []
        for y in range(0, h - patch + 1, stride):
            for x in range(0, w - patch + 1, stride):
                inter = [
                    max(0, min(x + patch, b[2]) - max(x, b[0])) * max(0, min(y + patch, b[3]) - max(y, b[1]))
                    for b in boxes
                ]
                truth.append(any(i > 0 for i in inter))
        predicted = [label in bad for label in grader.labels(image)]
        for t, p in zip(truth, predicted):
            tp += t and p
            fp += (not t) and p
            fn += t and not p
            tn += (not t) and not p
        images += 1
        images_flagged += any(predicted)
        share_errors.append(abs(sum(truth) / len(truth) - sum(predicted) / len(predicted)))
    return {
        "val_photos": images,
        "photos_with_a_defect_flagged": round(images_flagged / images, 3),
        "patch_defect_recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "patch_defect_precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "good_patch_false_alarm_rate": round(fp / (fp + tn), 4) if fp + tn else None,
        "mean_abs_share_error": round(mean(share_errors), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("checkpoint")
    parser.add_argument("--data-dir", help="kernels mode: held-out crops (…/kernels/val)")
    parser.add_argument("--tilda-dir", help="patches mode: TILDA YOLO dataset root")
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--json", help="Also write the report here")
    args = parser.parse_args()

    grader = Grader(args.checkpoint)
    mode = grader.analysis.get("mode")
    if mode == "kernels":
        report = evaluate_kernels(grader, Path(args.data_dir), args.samples, args.seed)
    elif mode == "patches":
        report = evaluate_patches(grader, Path(args.tilda_dir))
    else:
        raise SystemExit(f"No sample-level evaluation for mode {mode!r}")
    report["item_level_val"] = {
        k: grader.ckpt["metadata"]["val_metrics"][k] for k in ("accuracy", "balanced_accuracy", "per_class_recall")
    }
    print(json.dumps(report, indent=2))
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
