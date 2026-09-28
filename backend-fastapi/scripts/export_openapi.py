"""Write the compute service's OpenAPI schema to docs/api/openapi-compute.json.

CI regenerates it and fails if the committed copy is stale, so the published
contract always matches the code (same for Django's openapi-django.yaml).

    python scripts/export_openapi.py            # write
    python scripts/export_openapi.py --check    # exit 1 if the committed file is stale
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app  # noqa: E402

TARGET = Path(__file__).resolve().parents[2] / "docs" / "api" / "openapi-compute.json"

schema = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    if not TARGET.exists() or TARGET.read_text() != schema:
        print(f"{TARGET} is out of date — run: python scripts/export_openapi.py", file=sys.stderr)
        sys.exit(1)
    print("OpenAPI schema is up to date.")
else:
    TARGET.write_text(schema)
    print(f"Wrote {TARGET}")
