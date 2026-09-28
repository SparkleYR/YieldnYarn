# backend-fastapi — Compute/ML Service

FastAPI service handling grading (ML), pricing, and matching/allocation
compute workloads for the MSME Multi-Vertical Commodity Marketplace. See
`implementation_plan.md` §5 and §9 in the repo root for the full design.

Django (`backend-django/`) owns user-facing CRUD, auth, and the source-of-truth
database migrations. This service reads/writes the same Postgres database via
SQLAlchemy for compute-heavy paths (grading inference, pricing calculators,
multi-listing allocation).

## Two-tier requirements

- **`requirements.txt`** — base runtime deps (FastAPI, SQLAlchemy, psycopg,
  APScheduler, etc.). Fast to install. The service boots and serves every
  route with only this installed — grading falls back to a deterministic
  stub result if the ML stack isn't present.
- **`requirements-ml.txt`** — heavy ML inference deps (torch, torchvision,
  timm, opencv, numpy) for the real grading pipeline (§9); install with
  `--extra-index-url https://download.pytorch.org/whl/cpu` for CPU torch.
  Install this only when you're ready to run actual image-based grading.
  `grading/pipeline.py` / `grading/classifier.py` lazy-import everything in
  this file and fall back gracefully if it's missing. Trained checkpoints
  from `ml-training/` are served automatically once present (see
  `ml-training/README.md` → Serving).
- **`requirements-dev.txt`** — `pytest`, for running the unit test suite.

## Setup

```bash
cd backend-fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# optional, only for real ML grading (serves ml-training/checkpoints/*/grader.pt):
# pip install -r requirements-ml.txt --extra-index-url https://download.pytorch.org/whl/cpu

# for running tests:
pip install -r requirements-dev.txt
```

Configuration is loaded via `pydantic-settings` from the monorepo root
`.env` (`../.env` relative to this directory), specifically `DATABASE_URL`.
If `.env` isn't found, a sensible local default matching
`docker-compose.yml` is used (`postgresql://msme_dev:devpassword@localhost:5432/msme_marketplace`).

## Run

```bash
uvicorn main:app --reload --port 8001
```

Then visit `http://localhost:8001/docs` for interactive API docs, or
`GET /health` for a basic liveness check (no DB access required).

> **Note:** most routes under `/compute/*` do query the database (via
> SQLAlchemy models in `db.py`, mirroring tables Django's migrations create).
> If those tables don't exist yet (e.g. Django migrations haven't run),
> routes will return a `503` with a clear "Database not ready" message
> instead of crashing the app — the service itself boots and serves `/docs`
> and `/health` regardless.

## Project layout

```
backend-fastapi/
├── main.py              FastAPI app, CORS, APScheduler lifespan, /health
├── db.py                Settings (pydantic-settings) + SQLAlchemy engine/session/models
├── grading/
│   ├── router.py         POST /compute/grading/grade, GET /compute/grading/status/{id}
│   ├── pipeline.py        OpenCV preprocessing + grade_attributes() with ML fallback
│   └── schemas.py         Pydantic request/response models
├── pricing/
│   ├── router.py          GET /compute/pricing/{base,adjusted,estimate,trends}
│   └── service.py         Grade/quantity-tier price adjustment helpers
├── matching/
│   ├── router.py          POST /compute/matching/{find,allocate}
│   ├── allocation.py      Pure greedy allocation algorithm (§5.3) — no DB deps
│   └── schemas.py
├── scheduler/
│   ├── agmarknet.py       data.gov.in Agmarknet client + per-state/day aggregation
│   └── jobs.py            ingest_agmarknet_prices, expire_stale_listings (APScheduler jobs)
├── tests/                 pytest suites (allocation, routers, scheduler, Agmarknet, classifier)
├── requirements.txt
├── requirements-ml.txt
└── requirements-dev.txt
```

## Testing

```bash
pip install -r requirements-dev.txt
pytest
```

Most suites are integration tests against the live local Postgres
(`DATABASE_URL`, see `conftest.py`). The Agmarknet tests replace the
data.gov.in API with `httpx.MockTransport`; the real-inference classifier
tests build a randomly initialized MobileNetV3 checkpoint, and also load the
committed graders; they are skipped unless `requirements-ml.txt` is
installed (CI installs it).

`python scripts/export_openapi.py` regenerates `docs/api/openapi-compute.json`
(CI fails if it's stale; `--check` to verify).

## Service-to-service auth

`/compute/grading/*` and `/compute/matching/*` change data and are meant for
Django only. When `COMPUTE_INTERNAL_TOKEN` is set, they reject requests
without a matching `X-Internal-Token` header (Django sends it from its own
`COMPUTE_INTERNAL_TOKEN`). `/compute/pricing/*` is public read-only data used
directly by the web and seller apps. Leave the token empty only when the
service isn't reachable from outside (local dev).

## Table names

FastAPI's SQLAlchemy models in `db.py` mirror tables owned by Django's
migrations (built by a separate, concurrent agent). Table names/columns were
verified directly against the applied migrations and the live `msme-postgres`
schema (`psql \d <table>`) — Django uses an explicit `Meta.db_table` per
model matching the plain names from the plan's §3.1 (e.g. `verticals`,
`listings`, `grading_results`, `price_points`), not its default
`<app_label>_<modelname>` convention. If Django's schema changes, update the
affected model(s) in `db.py` to match.

## Known simplifications / TODOs

- **Grading** runs synchronously in the request/response cycle (no job
  queue; ~0.15 s per photo on CPU). The vertical grader
  (`checkpoints/<vertical>/grader.pt`) scores the attributes it covers, and
  the rest use a per-attribute checkpoint or the OpenCV edge-density proxy.
  Evidence is read from Django's media directory, or downloaded from
  `EVIDENCE_BASE_URL` (+ `EVIDENCE_URL_QUERY` SAS) on Azure.
- **Pricing region** — `/adjusted` prefers the listing's own `region` (state,
  picked in the seller app) and falls back to the most recent price across
  all states.
- **Agmarknet ingestion** (`scheduler/agmarknet.py`) uses data.gov.in's
  public sample key (10 records per call, a few pages per run) until
  `AGMARKNET_API_KEY` is set; `AGMARKNET_USE_SAMPLE_KEY=false` disables that. It stores one price point per
  commodity/state/day (mean of that day's mandi modal prices), converted
  from ₹/quintal to the vertical's `unit_of_measure`.
