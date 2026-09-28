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

    python scripts/evaluate_grader.py checkpoints/agriculture/grader.pt \\
        --data-dir data/agriculture/kernels/val --raw-dir external/agroai/Dataset
    python scripts/evaluate_grader.py checkpoints/textiles/grader.pt \\
        --tilda-dir external/tilda/dataset --calibrate-false-alarm 0.02 --write
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
        self.transform = grading_model.eval_transform(
            self.ckpt["image_size"], self.ckpt.get("grayscale", False)
        )

    def probs(self, image) -> list[list[float]]:
        items = grading_model.items_for(image, self.analysis)
        if not items:
            return []
        with torch.inference_mode():
            batch = torch.stack([self.transform(item.image) for item in items])
            return torch.softmax(self.model(batch), dim=1).tolist()

    def labels(self, image) -> list[str]:
        return [
            grading_model.decide(row, self.classes, self.analysis)[0]
            for row in self.probs(image)
        ]


def compose_sample(crops: list, rng: random.Random, size: int = 1200):
    """Scatter crops (black background) on a green sheet without overlaps.
    Returns the sheet and the indices of the crops that found a spot."""
    from PIL import Image

    sheet = Image.new("RGB", (size, size), (70, 125, 40))
    boxes, placed = [], []
    for index, crop in enumerate(crops):
        img = crop.rotate(rng.choice([0, 90, 180, 270]), expand=True)
        for _ in range(60):
            x, y = rng.randint(0, size - img.width), rng.randint(0, size - img.height)
            box = (x - 12, y - 12, x + img.width + 12, y + img.height + 12)
            if all(
                box[2] < b[0] or box[0] > b[2] or box[3] < b[1] or box[1] > b[3]
                for b in boxes
            ):
                mask = img.convert("L").point(lambda v: 255 if v > 10 else 0)
                sheet.paste(img, (x, y), mask)
                boxes.append(box)
                placed.append(index)
                break
    return sheet, placed


def _raw_source(crop_path: Path, raw_index: dict[str, Path]) -> Path:
    """The unprocessed source crop behind a prepared one.

    Prepared crops (prepare_public_datasets.py) are already halo-stripped;
    segmenting a composite of them would erode them a second time and make
    sound kernels look broken. Real photos are eroded once, so compose from
    the raw crops when they're available. Prepared names are
    "<photo group>_<raw stem>.png"."""
    for i, ch in enumerate(crop_path.stem):
        if ch == "_" and crop_path.stem[i + 1 :] in raw_index:
            return raw_index[crop_path.stem[i + 1 :]]
    return crop_path


def _split_by_photo_group(
    paths: list[Path], raw_index: dict[str, Path]
) -> tuple[list[Path], list[Path]]:
    """(even, odd) photo groups, so calibration and evaluation never share a photo."""

    def group(path: Path) -> str:
        for i, ch in enumerate(path.stem):
            if ch == "_" and path.stem[i + 1 :] in raw_index:
                return path.stem[:i]
        return path.stem

    groups = sorted({group(p) for p in paths})
    even = set(groups[0::2])
    return [p for p in paths if group(p) in even], [
        p for p in paths if group(p) not in even
    ]


def evaluate_kernels(
    grader: Grader,
    data_dir: Path,
    samples: int,
    seed: int,
    raw_dir: Path | None = None,
    calibrate_false_alarm: float | None = None,
) -> dict:
    """Synthetic sample photos with known shares, graded through the serving
    path. With calibrate_false_alarm, the decision threshold is first fitted
    on sound-only sheets built from half of the held-out photo groups, and
    the evaluation uses crops from the other half only."""
    from PIL import Image

    rng = random.Random(seed)
    raw_index = {p.stem: p for p in raw_dir.rglob("*.jpg")} if raw_dir else {}
    prepared = {
        d.name: sorted(d.glob("*.png")) for d in data_dir.iterdir() if d.is_dir()
    }
    report: dict = {}
    if calibrate_false_alarm is not None:
        good_class = "0_sound"
        good_index = grader.classes.index(good_class)
        split = {
            name: _split_by_photo_group(paths, raw_index)
            for name, paths in prepared.items()
        }
        calib = [_raw_source(p, raw_index) for p in split[good_class][0]]
        p_bad = []
        for _ in range(max(4, samples // 4)):
            sheet, _ = compose_sample(
                [Image.open(p).convert("RGB") for p in rng.sample(calib, 60)], rng
            )
            p_bad += [1.0 - row[good_index] for row in grader.probs(sheet)]
        p_bad.sort()
        threshold = round(
            p_bad[min(len(p_bad) - 1, int(len(p_bad) * (1 - calibrate_false_alarm)))], 4
        )
        grader.analysis["decision"] = {
            "good_class": good_class,
            "bad_threshold": threshold,
        }
        report["calibration"] = {
            "target_false_alarm_rate": calibrate_false_alarm,
            "bad_threshold": threshold,
            "fitted_on_items": len(p_bad),
        }
        prepared = {name: odd for name, (_, odd) in split.items()}
    by_class = {
        name: [_raw_source(p, raw_index) for p in paths]
        for name, paths in prepared.items()
    }

    attrs = grader.analysis["attributes"]
    errors = {name: [] for name in attrs}
    clean_shares = {name: [] for name in attrs}
    counts = []
    for sample in range(samples):
        n = rng.randint(40, 80)
        # Every 4th sample is all sound kernels: what a clean lot reads as.
        foreign_share = (
            0.0 if sample % 4 == 0 else rng.choice([0.0, 0.02, 0.05, 0.1, 0.2])
        )
        damaged_share = 0.0 if sample % 4 == 0 else rng.choice([0.0, 0.1, 0.25, 0.4])
        n_foreign = round(n * foreign_share)
        n_damaged = round((n - n_foreign) * damaged_share)
        n_sound = n - n_foreign - n_damaged
        picks = (
            [("2_foreign", p) for p in rng.sample(by_class["2_foreign"], n_foreign)]
            + [("1_damaged", p) for p in rng.sample(by_class["1_damaged"], n_damaged)]
            + [("0_sound", p) for p in rng.sample(by_class["0_sound"], n_sound)]
        )
        rng.shuffle(picks)
        sheet, placed = compose_sample(
            [Image.open(p).convert("RGB") for _, p in picks], rng
        )
        truth_labels = [picks[i][0] for i in placed]
        predicted = grader.labels(sheet)
        counts.append((len(predicted), len(placed)))
        truth = grading_model.share_scores(truth_labels, grader.analysis)
        guess = grading_model.share_scores(predicted, grader.analysis)
        for name in attrs:
            if name in truth and name in guess:
                errors[name].append(
                    abs(truth[name]["bad_share"] - guess[name]["bad_share"])
                )
                if sample % 4 == 0:
                    clean_shares[name].append(guess[name]["bad_share"])
    report.update(
        {
            "samples": samples,
            "segmentation_found_vs_placed": round(mean(f / p for f, p in counts), 3),
            "mean_abs_share_error": {
                name: round(mean(v), 4) for name, v in errors.items() if v
            },
            "clean_sample_mean_bad_share": {
                name: round(mean(v), 4) for name, v in clean_shares.items() if v
            },
        }
    )
    return report


def _grid_truth(
    image, label_path: Path, patch: int, stride: int, long_side: int
) -> list[bool]:
    """Per-patch "touches a defect box" on the same grid tile_patches() uses."""
    scale = long_side / max(image.size)
    w, h = round(image.width * scale), round(image.height * scale)
    boxes = []
    for line in label_path.read_text().split("\n") if label_path.exists() else []:
        parts = line.split()
        if len(parts) == 5:
            _, cx, cy, bw, bh = map(float, parts)
            boxes.append(
                (
                    (cx - bw / 2) * w,
                    (cy - bh / 2) * h,
                    (cx + bw / 2) * w,
                    (cy + bh / 2) * h,
                )
            )
    truth = []
    for y in range(0, h - patch + 1, stride):
        for x in range(0, w - patch + 1, stride):
            truth.append(
                any(
                    max(0, min(x + patch, b[2]) - max(x, b[0]))
                    * max(0, min(y + patch, b[3]) - max(y, b[1]))
                    > 0
                    for b in boxes
                )
            )
    return truth


def evaluate_patches(
    grader: Grader, tilda_dir: Path, calibrate_false_alarm: float | None = None
) -> dict:
    """Patch-level good-vs-defect agreement on held-out TILDA photos, using the
    same grid the grader tiles with and the photos' bounding boxes.

    With calibrate_false_alarm, the decision threshold (grading_model.decide)
    is fitted on the even-numbered held-out photos to hit that good-patch
    false-alarm rate, and everything is reported on the odd-numbered ones.
    """
    from PIL import Image

    tiling = grader.analysis.get("tiling", {})
    patch, stride, long_side = (
        tiling.get("patch", 64),
        tiling.get("stride", 64),
        tiling.get("long_side", 768),
    )
    bad = set(next(iter(grader.analysis["attributes"].values()))["bad_classes"])
    good_class = next(c for c in grader.classes if c not in bad)
    photos = []
    for image_path in sorted((tilda_dir / "images" / "val").glob("*.jpg")):
        image = Image.open(image_path)
        truth = _grid_truth(
            image,
            tilda_dir / "labels" / "val" / f"{image_path.stem}.txt",
            patch,
            stride,
            long_side,
        )
        photos.append((truth, grader.probs(image)))

    report: dict = {}
    if calibrate_false_alarm is not None:
        good_index = grader.classes.index(good_class)
        clean_p_bad = sorted(
            1.0 - row[good_index]
            for truth, rows in photos[0::2]
            for t, row in zip(truth, rows)
            if not t
        )
        cut = min(
            len(clean_p_bad) - 1, int(len(clean_p_bad) * (1 - calibrate_false_alarm))
        )
        threshold = round(clean_p_bad[cut], 4)
        grader.analysis["decision"] = {
            "good_class": good_class,
            "bad_threshold": threshold,
        }
        report["calibration"] = {
            "target_false_alarm_rate": calibrate_false_alarm,
            "bad_threshold": threshold,
            "fitted_on_photos": len(photos[0::2]),
        }
        photos = photos[1::2]

    tp = fp = fn = tn = 0
    images_flagged = 0
    share_errors = []
    for truth, rows in photos:
        predicted = [
            grading_model.decide(row, grader.classes, grader.analysis)[0] in bad
            for row in rows
        ]
        for t, p in zip(truth, predicted):
            tp += t and p
            fp += (not t) and p
            fn += t and not p
            tn += (not t) and not p
        images_flagged += any(predicted)
        share_errors.append(
            abs(sum(truth) / len(truth) - sum(predicted) / len(predicted))
        )
    report.update(
        {
            "val_photos": len(photos),
            "photos_with_a_defect_flagged": round(images_flagged / len(photos), 3),
            "patch_defect_recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "patch_defect_precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "good_patch_false_alarm_rate": round(fp / (fp + tn), 4)
            if fp + tn
            else None,
            "mean_abs_share_error": round(mean(share_errors), 4),
        }
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("checkpoint")
    parser.add_argument(
        "--data-dir", help="kernels mode: held-out crops (…/kernels/val)"
    )
    parser.add_argument(
        "--raw-dir",
        help="kernels mode: the unprocessed source crops (external/agroai/Dataset), see _raw_source()",
    )
    parser.add_argument("--tilda-dir", help="patches mode: TILDA YOLO dataset root")
    parser.add_argument("--samples", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument(
        "--calibrate-false-alarm",
        type=float,
        help="Fit the bad-item threshold (grading_model.decide) for this false-alarm rate on good items, e.g. 0.02",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Save the calibrated decision rule into the checkpoint's analysis",
    )
    parser.add_argument("--json", help="Also write the report here")
    args = parser.parse_args()

    grader = Grader(args.checkpoint)
    mode = grader.analysis.get("mode")
    if mode == "kernels":
        report = evaluate_kernels(
            grader,
            Path(args.data_dir),
            args.samples,
            args.seed,
            Path(args.raw_dir) if args.raw_dir else None,
            args.calibrate_false_alarm,
        )
    elif mode == "patches":
        report = evaluate_patches(
            grader, Path(args.tilda_dir), args.calibrate_false_alarm
        )
    else:
        raise SystemExit(f"No sample-level evaluation for mode {mode!r}")
    if args.write and "calibration" in report:
        grader.ckpt["analysis"] = grader.analysis
        torch.save(grader.ckpt, args.checkpoint)
        print(
            f"Wrote decision rule {grader.analysis['decision']} into {args.checkpoint}"
        )
    report["item_level_val"] = {
        k: grader.ckpt["metadata"]["val_metrics"][k]
        for k in ("accuracy", "balanced_accuracy", "per_class_recall")
    }
    print(json.dumps(report, indent=2))
    if args.json:
        Path(args.json).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
