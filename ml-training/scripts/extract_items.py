"""Cut real evidence photos into grader items, pre-sorted for labelling.

The graders classify items (kernels / fabric patches), but verified listings
only carry listing-level scores, so retraining on marketplace photos needs
item-level labels. This runs the exact serving segmentation/tiling
(grading_model.items_for) over a folder of photos and writes every item to
<out>/<predicted class>/, using the current grader's guess. A person then
only moves the wrong ones to the right folder — much faster than labelling
from scratch — and the result merges straight into train_classifier.py's
ImageFolder layout (keep photos from one lot in one split, like
prepare_public_datasets.py does).

    python scripts/extract_items.py checkpoints/agriculture/grader.pt \\
        --photos ../backend-django/media/evidence --out data/agriculture/new_items
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import grading_model  # noqa: E402

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("checkpoint", help="grader.pt whose analysis (segmentation/tiling) and classes to use")
    parser.add_argument("--photos", required=True, help="Folder of evidence photos (searched recursively)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--no-presort", action="store_true", help="Write everything to <out>/unsorted instead")
    args = parser.parse_args()

    from PIL import Image

    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    analysis, classes = checkpoint["analysis"], checkpoint["classes"]
    model = None if args.no_presort else grading_model.load_checkpoint_model(checkpoint)
    transform = grading_model.eval_transform(checkpoint["image_size"], checkpoint.get("grayscale", False))
    out = Path(args.out)
    written: Counter = Counter()

    photos = sorted(p for p in Path(args.photos).rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)
    for photo in photos:
        with Image.open(photo) as image:
            items = grading_model.items_for(image, analysis)
        if not items:
            continue
        if model is None:
            labels = ["unsorted"] * len(items)
        else:
            with torch.inference_mode():
                probs = torch.softmax(model(torch.stack([transform(i.image) for i in items])), dim=1).tolist()
            labels = [grading_model.decide(row, classes, analysis)[0] for row in probs]
        for index, (item, label) in enumerate(zip(items, labels)):
            target = out / label / f"{photo.stem}_{index:03d}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            item.image.save(target)
            written[label] += 1

    print(f"{len(photos)} photos -> {sum(written.values())} items in {out}: {dict(written)}")


if __name__ == "__main__":
    main()
