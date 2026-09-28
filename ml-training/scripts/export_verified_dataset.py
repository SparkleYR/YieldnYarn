"""Build a training dataset from verifier-confirmed listings (§9.3, step 3).

Every listing a verifier approves gets a VERIFIER-sourced grading_results row
with trusted per-attribute scores. This copies each such listing's IMAGE
evidence into the ImageFolder layout train_classifier.py expects, bucketed
by the verified score:

    data/<vertical>/<attribute>/0_good/   score >= --good (default 0.80)
    data/<vertical>/<attribute>/1_fair/   --fair <= score < --good (default 0.50)
    data/<vertical>/<attribute>/2_poor/   score < --fair

Reads the same DATABASE_URL as the backends (root .env) and needs access to
Django's media directory. Safe to re-run: existing files are skipped.

    python scripts/export_verified_dataset.py --vertical agriculture
"""

from __future__ import annotations

import argparse
import os
import shutil
from pathlib import Path

import psycopg

REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml-training"

QUERY = """
SELECT DISTINCT ON (gr.listing_id) gr.listing_id, gr.attribute_scores
FROM grading_results gr
JOIN listings l ON l.id = gr.listing_id
JOIN verticals v ON v.id = l.vertical_id
WHERE gr.source = 'VERIFIER' AND v.slug = %(vertical)s
ORDER BY gr.listing_id, gr.created_at DESC
"""

EVIDENCE_QUERY = "SELECT file FROM grading_evidence WHERE listing_id = %s AND file_type = 'IMAGE'"


def bucket_for(score: float, good: float, fair: float) -> str:
    if score >= good:
        return "0_good"
    if score >= fair:
        return "1_fair"
    return "2_poor"


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    env_file = REPO_ROOT / ".env"
    if not url and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
    return url or "postgresql://msme_dev:devpassword@localhost:5432/msme_marketplace"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--vertical", required=True)
    parser.add_argument("--attribute", action="append", help="Only these attributes (repeatable); default all")
    parser.add_argument("--media-root", default=str(REPO_ROOT / "backend-django" / "media"))
    parser.add_argument("--out", default=str(ML_ROOT / "data"))
    parser.add_argument("--good", type=float, default=0.80)
    parser.add_argument("--fair", type=float, default=0.50)
    args = parser.parse_args()

    media_root, out_root = Path(args.media_root), Path(args.out)
    counts: dict[tuple[str, str], int] = {}
    missing = 0
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute(QUERY, {"vertical": args.vertical})
        verified = cur.fetchall()
        for listing_id, attribute_scores in verified:
            cur.execute(EVIDENCE_QUERY, (listing_id,))
            files = [media_root / row[0] for row in cur.fetchall()]
            for attribute, score in (attribute_scores or {}).items():
                if args.attribute and attribute not in args.attribute:
                    continue
                bucket = bucket_for(float(score), args.good, args.fair)
                target_dir = out_root / args.vertical / attribute / bucket
                target_dir.mkdir(parents=True, exist_ok=True)
                for source in files:
                    if not source.exists():
                        missing += 1
                        continue
                    target = target_dir / f"listing{listing_id}_{source.name}"
                    if not target.exists():
                        shutil.copy2(source, target)
                    counts[(attribute, bucket)] = counts.get((attribute, bucket), 0) + 1

    print(f"{len(verified)} verifier-confirmed listings in '{args.vertical}'")
    for (attribute, bucket), count in sorted(counts.items()):
        print(f"  {attribute}/{bucket}: {count} images")
    if missing:
        print(f"  ({missing} evidence files referenced in the DB were not found under {media_root})")
    print("Aim for 200+ images per class before training (implementation_plan.md §9.3).")


if __name__ == "__main__":
    main()
