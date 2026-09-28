# ML Training — MSME Marketplace Grading Pipeline

Trains, evaluates and calibrates the graders that `backend-fastapi/grading/` serves.
See `implementation_plan.md` §9 for the architecture.

## What ships today

Each vertical has one **grader**, `checkpoints/<vertical>/grader.pt`. It holds a MobileNetV3-Small
(timm, ImageNet-pretrained) plus an `analysis` block that says how to turn an evidence photo into
many small inputs and how to score them:

| Vertical | Analysis | Classes | Attributes (score 1 = best) |
|---|---|---|---|
| agriculture | Segment each kernel/particle on the sheet (Otsu on the red channel) | sound, damaged, foreign, husk-covered | `foreign_matter`: share of non-kernel particles, 0 → 1.0, ≥10% → 0.0. `damaged_kernels`: share of kernels damaged/broken, 0 → 1.0, ≥25% → 0.0 |
| textiles | Tile the photo into 64 px patches (long side 768 px) | good, hole, objects, oil spot, thread error | `defect_rate`: share of defective patches, ≤2% (noise floor) → 1.0, ≥12% → 0.0 |

A calibrated decision rule means an item only counts as bad when P(not good) clears a threshold.
The threshold was fitted on held-out photos, so a clean lot isn't graded down by classifier
noise. Confidence is capped at the checkpoint's validated balanced accuracy. **With today's
public-data models, every AI grade therefore goes to a verifier (cap < 0.80).** That is deliberate:
the graders pre-fill the verifier's form; they don't replace it.

### Datasets

Kaggle, Hugging Face, Zenodo, Mendeley and Google Drive were unreachable from the build
environment, so both datasets come from GitHub. `scripts/prepare_public_datasets.py` clones them into
`external/`, cleans them and writes `data/` (both are gitignored):

- **Wheat kernels:** [sachin235/AgroAI](https://github.com/sachin235/AgroAI). 7,139 segmented crops
  (grain, damaged, broken, foreign particles, husk-covered). Broken and damaged are merged (after
  MD5 dedup); green-sheet fragments are dropped as label noise; the background halo is eroded.
  Splits are made by source photo. **The repo has no licence file**, so ask the author before any
  commercial use.
- **Fabric:** TILDA-400 in YOLO format from
  [sivasgitt/AI-Fabric-Defect-Detection](https://github.com/sivasgitt/AI-Fabric-Defect-Detection).
  400 photos (768×512) with defect boxes. Patches are labelled from box overlap, and good patches
  must clear every box by 8 px. TILDA is a research dataset (TU Hamburg-Harburg), so check its terms
  before commercial use.

### Results (`reports/*.json`, produced by `evaluate_grader.py`)

| | Item-level (val) | Sample-level |
|---|---|---|
| Wheat | balanced accuracy 0.58 (sound 0.88, damaged 0.23, foreign 0.63) | Synthetic sample photos built from held-out kernels, threshold fitted on other photo groups: share error 0.026 foreign / 0.125 damaged; a clean lot reads 0% foreign / 1.7% damaged. Damaged kernels are under-detected. |
| Fabric | balanced accuracy 0.57 (good 0.84; defects 0.40–0.59) | Held-out TILDA photos, threshold fitted on the other half: 2% good-patch false alarms, defect-patch precision 0.85, recall 0.40 |

Inference takes 125–170 ms per photo on 1–2 CPU threads.

## Workflow

```bash
cd ml-training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# 1. Data
python scripts/prepare_public_datasets.py           # public data -> data/agriculture/kernels, data/textiles/patches

# 2. Train (CPU works: ~15 min each; add --weights <file> to use local ImageNet weights)
python scripts/train_classifier.py --vertical agriculture --data-dir data/agriculture/kernels \
    --analysis configs/agriculture_grader.json --image-size 128 --epochs 12
python scripts/train_classifier.py --vertical textiles --data-dir data/textiles/patches \
    --analysis configs/textiles_grader.json --image-size 96 --grayscale --epochs 8 --samples-per-epoch 15000

# 3. Calibrate + evaluate on whole photos, and write the decision rule into the checkpoint
python scripts/evaluate_grader.py checkpoints/agriculture/grader.pt --data-dir data/agriculture/kernels/val \
    --raw-dir external/agroai/Dataset --calibrate-false-alarm 0.10 --write --json reports/agriculture_grader_eval.json
python scripts/evaluate_grader.py checkpoints/textiles/grader.pt --tilda-dir external/tilda/dataset \
    --calibrate-false-alarm 0.02 --write --json reports/textiles_grader_eval.json
```

### Retraining on real marketplace photos (the way to lift the confidence cap)

1. Gather evidence photos. `export_verified_dataset.py --vertical agriculture` pulls
   verifier-approved listings, or you can use `backend-django/media/evidence/` directly.
2. `python scripts/extract_items.py checkpoints/agriculture/grader.pt --photos <photos> --out data/agriculture/new_items`
   cuts every photo into kernels or patches exactly as serving does and pre-sorts them into class
   folders using the current grader. Move the misplaced ones; that's the whole labelling job.
3. Merge them into `data/<vertical>/.../train` and `val`, keeping each lot's photos in one split.
   Then retrain and re-calibrate (steps 2–3 above) and copy the new `grader.pt` into place. FastAPI
   hot-reloads it, and the confidence cap rises with the new validated accuracy.

The per-attribute whole-image path still exists: `train_classifier.py --attribute …` without
`--analysis` writes `checkpoints/<vertical>/<attribute>.pt`, which FastAPI serves for any attribute
the grader doesn't cover. `evaluate.py` evaluates those.

## Serving (`backend-fastapi/grading/`)

- It loads `grading_model.py` from this directory, so the network, transforms, segmentation/tiling,
  decision rule and scoring can't drift between training and serving.
- The grader runs first. Any remaining `gradeable_by_ml` attributes use a per-attribute checkpoint if
  one exists, else the OpenCV edge-density proxy (`preprocess.py`).
- Checkpoints are cached by mtime, so a new file is picked up without a restart. The FastAPI
  environment needs `backend-fastapi/requirements-ml.txt`.

## Layout

```
configs/*_grader.json              Analysis config per vertical (mode, attributes, tolerances)
scripts/grading_model.py           Model, checkpoint format, segmentation/tiling, scoring (shared with FastAPI)
scripts/preprocess.py              OpenCV features (shared with FastAPI)
scripts/prepare_public_datasets.py Public datasets -> data/
scripts/train_classifier.py        Train a grader (--analysis) or a single-attribute classifier
scripts/evaluate_grader.py         Sample-level evaluation + decision-threshold calibration
scripts/extract_items.py           Real photos -> pre-sorted item crops for labelling
scripts/export_verified_dataset.py Verifier-confirmed evidence -> ImageFolder
scripts/evaluate.py                Single-attribute classifier evaluation
checkpoints/<vertical>/grader.pt   Shipped graders (~6 MB each, committed)
reports/                           Evaluation reports for the shipped graders
data/, external/                   Local-only (gitignored)
```
