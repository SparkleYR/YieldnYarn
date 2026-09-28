# ML Training — MSME Marketplace Grading Pipeline

Scripts and notebooks used to fine-tune the grading models consumed by
`backend-fastapi/grading/`. See `implementation_plan.md` §9 for full architecture.

## Pipeline

```
Evidence Upload → Django (file storage) → FastAPI (grading trigger)
                                              ↓
                                    OpenCV preprocessing (scripts/preprocess.py)
                                              ↓
                                    MobileNetV3 (classification) / YOLOv8n (detection)
                                              ↓
                                    Confidence score + attribute grades
                                              ↓
                              confidence ≥ 80%?  → grading_results (AI)
                              confidence < 80%?  → verification queue
```

## Grading attributes by vertical

| Vertical | ML-gradeable | Not ML-gradeable (manual/instrument) |
|---|---|---|
| Agriculture (e.g. wheat) | `foreign_matter` (visual defect detection) | `moisture_content`, `grade_standard` |
| Textiles (e.g. cotton fabric) | `defect_rate` (weaving defects, stains, holes) | `gsm`, `thread_count` |

## Model selection

| Model | Params | Size | CPU inference | GPU inference | Use case |
|---|---|---|---|---|---|
| MobileNetV3-Small | 2.5M | 10MB | ~15ms | ~3ms | Grade classification |
| YOLOv8n | 3.2M | 6MB | ~30ms | ~5ms | Defect/foreign-matter localization |

## Training plan

1. Start from pretrained weights (ImageNet for MobileNetV3) for general feature
   extraction — expect low initial accuracy and heavy verifier routing.
2. As verifier-confirmed results accumulate (target: 200+ labeled images per class), export
   them into `data/` and fine-tune (below).
3. Fine-tuning runs locally on an RTX 3050 6GB, well within VRAM budget.

Detection (YOLOv8n, for localizing defects/foreign matter) is not wired yet — grading uses
the classifier's per-attribute quality score.

## Workflow (run on the GPU machine)

```bash
cd ml-training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Pull verifier-confirmed evidence into data/<vertical>/<attribute>/{0_good,1_fair,2_poor}/
#    (reads DATABASE_URL from the root .env and images from backend-django/media)
python scripts/export_verified_dataset.py --vertical agriculture

# 2. Train one attribute; writes checkpoints/agriculture/foreign_matter.pt
python scripts/train_classifier.py --vertical agriculture --attribute foreign_matter

# 3. Check it on images it hasn't seen, including how much would still go to verifiers
python scripts/evaluate.py checkpoints/agriculture/foreign_matter.pt data/holdout/agriculture/foreign_matter
```

You can also hand-label images into the same layout instead of (or on top of) step 1. Class
directories are quality buckets; by default they're scored 1.0 → 0.0 in alphabetical order, so
name them best-to-worst (`0_clean`, `1_minor`, `2_heavy`) or pass `--class-scores
'clean=1.0,minor=0.6,heavy=0.1'`.

## Serving

`backend-fastapi` picks checkpoints up automatically — no code change or restart needed:

- It looks for `<GRADING_MODELS_DIR>/<vertical_slug>/<attribute>.pt` (default: this directory's
  `checkpoints/`) for every attribute marked `gradeable_by_ml` in the vertical's grading schema.
- It rebuilds the network with `scripts/grading_model.py`, the same module training uses, so
  architecture and input normalization can't drift between train and serve.
- Attribute score = probability-weighted class score; confidence = top-class probability,
  averaged over the listing's photos. The listing's confidence is its least certain attribute's,
  and anything under 80% goes to a verifier.
- Attributes without a checkpoint keep using the OpenCV heuristic, so models can roll out one
  attribute at a time. The FastAPI env needs `requirements-ml.txt` installed for any of this.

## Setup

```bash
cd ml-training
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Layout

```
scripts/grading_model.py           Model + checkpoint format (shared with backend-fastapi)
scripts/preprocess.py              OpenCV preprocessing (shared with backend-fastapi)
scripts/export_verified_dataset.py Verifier-confirmed evidence -> labeled ImageFolder dataset
scripts/train_classifier.py        Fine-tune one attribute's classifier
scripts/evaluate.py                Holdout accuracy, confusion matrix, verifier routing rate
data/                              Local-only training data (gitignored)
checkpoints/                       Trained weights (gitignored)
```
