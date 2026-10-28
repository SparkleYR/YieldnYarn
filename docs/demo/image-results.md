# Real dataset image rehearsal results

Eight listing workflows using 15 unmodified source photographs were tested on this laptop on 9 October 2026. All uploads, local MobileNet inference, stored grades and low-confidence queue routing completed. This is an integration demonstration, not a representative accuracy benchmark.

The independent wheat and cotton collections differ from the documented training sources. The final wheat reference comes from the AgroAI training-source repository and is not an independent test.

| Case | Listing ID | Predicted grade | Confidence | Quality scores (0–100; higher is better) |
| --- | --- | --- | --- | --- |
| Wheat source A | 77 | Grade C | 57.92% | foreign_matter: 0.00, damaged_kernels: 97.50 |
| Wheat source D | 78 | Grade C | 57.92% | foreign_matter: 0.00, damaged_kernels: 0.00 |
| Wheat source F | 79 | Grade C | 57.92% | foreign_matter: 0.00, damaged_kernels: 100.00 |
| Cotton slub | 80 | Grade C | 57.03% | defect_rate: 0.00 |
| Cotton knot | 81 | Grade C | 57.03% | defect_rate: 0.00 |
| Cotton oil | 82 | Grade C | 50.83% | defect_rate: 0.00 |
| Cotton hole | 83 | Grade C | 57.03% | defect_rate: 57.50 |
| Wheat green-sheet reference | 84 | Grade A | 57.92% | foreign_matter: 100.00, damaged_kernels: 100.00 |

All eight listings remain PENDING_VERIFICATION. Agriculture entries are on farmer@demo.local; textiles are on weaver@demo.local. Password: Demo@12345.

## Interpretation

The wheat source labels A, D and F describe the source dataset, not the output expected from YieldnYarn. YieldnYarn derives its grade from its own visible-quality attribute scores. The source A photographs look clean, yet the model reports 48.9% foreign particles and Grade C. This is a visible misclassification on these samples. Different capture conditions are a plausible cause, but this test does not establish the cause. Do not describe the wheat model as accurate across arbitrary phone photos.

All four fabric defect groups were processed; the reported defective-patch shares differ (slub 41.7%, knot 43.8%, oil 14.9%, hole 6.2%). These are model estimates, not ground-truth defect area percentages.

Confidence is capped at the checkpoint's validation balanced accuracy (wheat approximately 57.92%, fabric approximately 57.03%). All current checkpoint results therefore route to a human verifier; a repeated confidence value is expected. A manually approved result is a verifier decision, not an improved AI prediction.

## Image sources

- Wheat: [Sanjay Deshmukh / Wheat Grading & Type Dataset](https://huggingface.co/datasets/SamWithAi/Wheat_Grading_Dataset). Two original photographs each from Grade/Test/A, D and F were extracted byte-for-byte from Wheat_Data.zip; no full 3.56 GB archive download was needed.
- Cotton: [Defect Spectrum, DS-Cotton-Fabric](https://huggingface.co/datasets/DefectSpectrum/Defect_Spectrum/tree/main/DS-Cotton-Fabric). Two original images each with Slubs, Knots, Oil-Spot and Hole in the source filenames. This is the image directory, not generated Defect-Gen output. Cotton Inc. is acknowledged by the authors as the underlying cotton source.
- Reference: [sachin235/AgroAI](https://github.com/sachin235/AgroAI/blob/master/test3.jpg). One original green-background full-sample photograph; no asserted source quality label.

## Exact files and provenance

- **wheat-source-A-1.jpg** — Dataset Grade/Test/A; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/A/20251011_024338.jpg`.
- **wheat-source-A-2.jpg** — Dataset Grade/Test/A; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/A/20251011_024351(0).jpg`.
- **wheat-source-D-1.jpg** — Dataset Grade/Test/D; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/D/20251013_024831.jpg`.
- **wheat-source-D-2.jpg** — Dataset Grade/Test/D; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/D/20251013_024855.jpg`.
- **wheat-source-F-1.jpg** — Dataset Grade/Test/F; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/F/20251013_025714.jpg`.
- **wheat-source-F-2.jpg** — Dataset Grade/Test/F; source label, not YieldnYarn prediction; 2048×2048 pixels; `Wheat_Data/Grade/Test/F/20251013_025716.jpg`.
- **cotton-slub-1.jpg** — slub in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/00960_0001_Slubs.jpg`.
- **cotton-slub-2.jpg** — slub in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/00961_0004_Slubs.jpg`.
- **cotton-knot-1.jpg** — knot in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/00964_0007_Knots.jpg`.
- **cotton-knot-2.jpg** — knot in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/00965_0009_Knots.jpg`.
- **cotton-oil-1.jpg** — oil in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/01028_0132_Oil-Spot.jpg`.
- **cotton-oil-2.jpg** — oil in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/01029_0133_Oil-Spot.jpg`.
- **cotton-hole-1.jpg** — hole in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/01040_0183_Hole.jpg`.
- **cotton-hole-2.jpg** — hole in source filename; 512×512 pixels; `DS-Cotton-Fabric/image/01041_0184_Hole.jpg`.
- **wheat-green-sheet-reference.jpg** — Unlabelled whole-image reference; overlaps the training-source collection; 2250×3278 pixels; `test3.jpg`.

All 15 transferred phone files matched their laptop SHA-256 hashes. The original-file hashes, source paths and complete raw model responses are saved in `.demo/real-images/manifest.json`, `grading-results.json` and `phone-transfer.json`. Original photos are in `.demo/real-images/photos/` and phone album **Pictures/YieldnYarnReal**.

To repeat the integration rehearsal, run `.\.demo\venv\Scripts\python.exe infra\local\check-real-images.py`. This is a write test: it creates clearly named demo listings and reruns grading on existing cases. Run it before making verifier decisions, since retriggering grading can change their state.
