"""Download and prepare the public datasets the bundled grading models are trained on.

Sources (cloned from GitHub into ml-training/external/, gitignored):

* Wheat kernels — https://github.com/sachin235/AgroAI (Dataset/): 7,139
  single-kernel crops from photos of wheat samples, labelled grain /
  damaged_grain / grain_broken / foreign_particles / grain_covered. The repo
  has no licence file: fine for this pilot's R&D, ask the author before
  commercial use.
* Fabric — TILDA-400 in YOLO format from
  https://github.com/sivasgitt/AI-Fabric-Defect-Detection (dataset/): 400
  greyscale 768x512 textile photos with bounding boxes for hole / objects /
  oil spot / thread error. TILDA (Uni Freiburg texture analysis group) is
  published for research use.

Output (ImageFolder layout, split so no source photo is on both sides):

    data/agriculture/kernels/{train,val}/{0_sound,1_damaged,2_foreign,3_covered}/
    data/textiles/patches/{train,val}/{0_good,1_hole,2_objects,3_oil_spot,4_thread_error}/

    python scripts/prepare_public_datasets.py
"""
from __future__ import annotations

import argparse
import hashlib
import random
import re
import shutil
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
EXTERNAL = ML_ROOT / "external"

SOURCES = {
    "agroai": "https://github.com/sachin235/AgroAI",
    "tilda": "https://github.com/sivasgitt/AI-Fabric-Defect-Detection",
}

# AgroAI folder -> our class. damaged and broken kernels are one class: 143
# images are filed under both folders, and for grading both mean "not sound".
WHEAT_CLASSES = {
    "grain": "0_sound",
    "damaged_grain": "1_damaged",
    "grain_broken": "1_damaged",
    "foreign_particles": "2_foreign",
    "grain_covered": "3_covered",
}



def is_green_sheet(crop) -> bool:
    """AgroAI photos were taken on a green sheet, and some "foreign_particles"
    crops are just pieces of it. Wheat, chaff, stones and seeds are never
    mostly strongly green, so these are dropped as label noise."""
    import numpy as np

    px = crop.reshape(-1, 3).astype(int)
    px = px[px.sum(1) > 0]
    green = (px[:, 1] > px[:, 0] + 20) & (px[:, 1] > px[:, 2] + 20)
    return len(px) > 0 and green.mean() > 0.5

FABRIC_CLASSES = {0: "1_hole", 1: "2_objects", 2: "3_oil_spot", 3: "4_thread_error"}
GOOD = "0_good"


def clone(name: str) -> Path:
    target = EXTERNAL / name
    if not (target / ".git").exists():
        EXTERNAL.mkdir(parents=True, exist_ok=True)
        subprocess.run(["git", "clone", "--depth", "1", SOURCES[name], str(target)], check=True)
    return target


def reset(path: Path) -> Path:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)
    return path


# --- wheat -------------------------------------------------------------------


def photo_group(filename: str) -> str:
    """IMG_20161016_124705064_395.jpg -> IMG_20161016_124705064 (the source photo)."""
    return re.sub(r"_\d+$", "", Path(filename).stem)


def prepare_wheat(val_fraction: float, seed: int) -> None:
    source = clone("agroai") / "Dataset"
    out = reset(ML_ROOT / "data" / "agriculture" / "kernels")

    seen: set[str] = set()
    files_by_group: dict[str, list[tuple[Path, str]]] = defaultdict(list)
    for folder, cls in WHEAT_CLASSES.items():
        for path in sorted((source / folder).glob("*.jpg")):
            digest = hashlib.md5(path.read_bytes()).hexdigest()
            if digest in seen:  # the damaged/broken double-filed images
                continue
            seen.add(digest)
            files_by_group[photo_group(path.name)].append((path, cls))

    # Most source photos hold a single class (samples were sorted before
    # being photographed), so a plain random photo split can put a whole class
    # on one side. Assign photos to val per dominant class instead, until that
    # class has ~val_fraction of its images in val.
    groups = sorted(files_by_group)
    random.Random(seed).shuffle(groups)
    class_totals: Counter = Counter(cls for files in files_by_group.values() for _, cls in files)
    val_counts: Counter = Counter()
    val_groups = set()
    for group in groups:
        dominant, size = Counter(cls for _, cls in files_by_group[group]).most_common(1)[0]
        if val_counts[dominant] + size <= class_totals[dominant] * val_fraction * 1.5 and (
            val_counts[dominant] < class_totals[dominant] * val_fraction
        ):
            val_groups.add(group)
            for _, cls in files_by_group[group]:
                val_counts[cls] += 1

    import sys

    import numpy as np
    from PIL import Image

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from grading_model import strip_halo

    counts: Counter = Counter()
    dropped: Counter = Counter()
    for group, files in files_by_group.items():
        split = "val" if group in val_groups else "train"
        for path, cls in files:
            # The same halo stripping the grading service applies, so train
            # and serve inputs match.
            cleaned = strip_halo(np.asarray(Image.open(path).convert("RGB")))
            if cleaned is None or is_green_sheet(cleaned):
                dropped[cls] += 1
                continue
            dest = out / split / cls
            dest.mkdir(parents=True, exist_ok=True)
            Image.fromarray(cleaned).save(dest / f"{group}_{path.stem}.png")
            counts[(split, cls)] += 1
    print("wheat kernels:", dict(sorted(counts.items())))
    print("dropped as background artefacts:", dict(dropped))


# --- fabric ------------------------------------------------------------------


def overlap(a, b) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    return max(0, x1 - x0) * max(0, y1 - y0)


def prepare_fabric(patch: int, stride: int, good_per_defect: float, seed: int) -> None:
    from PIL import Image

    source = clone("tilda") / "dataset"
    out = reset(ML_ROOT / "data" / "textiles" / "patches")
    rng = random.Random(seed)
    counts: Counter = Counter()

    for split in ("train", "val"):
        good_candidates = []
        for image_path in sorted((source / "images" / split).glob("*.jpg")):
            label_path = source / "labels" / split / f"{image_path.stem}.txt"
            image = Image.open(image_path).convert("L")
            w, h = image.size
            boxes = []
            for line in label_path.read_text().split("\n") if label_path.exists() else []:
                parts = line.split()
                if len(parts) != 5:
                    continue
                cls, cx, cy, bw, bh = int(parts[0]), *map(float, parts[1:])
                boxes.append((cls, ((cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h)))

            for y in range(0, h - patch + 1, stride):
                for x in range(0, w - patch + 1, stride):
                    tile = (x, y, x + patch, y + patch)
                    margin = (x - 8, y - 8, x + patch + 8, y + patch + 8)
                    hits = [(cls, box) for cls, box in boxes if overlap(margin, box) > 0]
                    if not hits:
                        good_candidates.append((image_path, tile))
                        continue
                    # Label a patch with a defect only when it clearly shows
                    # it: most of the box inside, or the box fills much of it.
                    for cls, box in hits:
                        inter = overlap(tile, box)
                        box_area = max(1.0, (box[2] - box[0]) * (box[3] - box[1]))
                        if inter / box_area >= 0.5 or inter / (patch * patch) >= 0.25:
                            dest = out / split / FABRIC_CLASSES[cls]
                            dest.mkdir(parents=True, exist_ok=True)
                            image.crop(tile).save(dest / f"{image_path.stem[:3]}_{x}_{y}.png")
                            counts[(split, FABRIC_CLASSES[cls])] += 1
                            break

        # Good patches vastly outnumber defects; keep a balanced-ish sample.
        defects = sum(v for (s, _), v in counts.items() if s == split)
        rng.shuffle(good_candidates)
        dest = out / split / GOOD
        dest.mkdir(parents=True, exist_ok=True)
        for image_path, tile in good_candidates[: int(defects * good_per_defect)]:
            Image.open(image_path).convert("L").crop(tile).save(dest / f"{image_path.stem[:3]}_{tile[0]}_{tile[1]}.png")
            counts[(split, GOOD)] += 1
    print("fabric patches:", dict(sorted(counts.items())))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", choices=["wheat", "fabric"])
    parser.add_argument("--val-fraction", type=float, default=0.2)
    parser.add_argument("--patch", type=int, default=64)
    parser.add_argument("--stride", type=int, default=32)
    parser.add_argument("--good-per-defect", type=float, default=1.5)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.only in (None, "wheat"):
        prepare_wheat(args.val_fraction, args.seed)
    if args.only in (None, "fabric"):
        prepare_fabric(args.patch, args.stride, args.good_per_defect, args.seed)
