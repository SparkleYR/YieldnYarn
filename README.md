# MSME Multi-Vertical Commodity Marketplace

A pilot marketplace connecting MSME sellers (agriculture, textiles) with buyers, featuring
AI-assisted quality grading, real-time price intelligence, and automated order matching.

See [`docs/MSME_Marketplace_Project_Document.md`](docs/MSME_Marketplace_Project_Document.md) and
[`docs/MSME_Marketplace_Build_Plan.md`](docs/MSME_Marketplace_Build_Plan.md) for product context,
and [`implementation_plan.md`](implementation_plan.md) / [`frontend_plan.md`](frontend_plan.md) for
the full technical build plan this repository implements.

## Monorepo Layout

```
backend-django/   Django + DRF — auth, CRUD, admin, catalog, orders, disputes, notifications
backend-fastapi/  FastAPI — ML grading, pricing intelligence, matching/allocation engine
ml-training/      Grading model definition, dataset export, training + evaluation scripts
web-app/          Next.js 16 — marketing site + buyer/admin/verifier dashboards (English/Hindi)
seller-app/       Kotlin Android app for sellers (offline-first listing creation)
infra/            Azure Bicep (infra/azure), load test, local Postgres init script
docs/             Product & planning docs, OpenAPI schemas (docs/api), perf results (docs/perf)
```

## Quick start: whole stack in Docker

```bash
docker compose --profile app up -d --build
```

This gives you the web app at http://localhost:3000, the API at http://localhost:8000/api (Swagger
at `/api/docs/`) and the compute service at http://localhost:8001/compute. It runs the production
images: Django migrates and seeds the Agriculture and Textiles verticals on start, and FastAPI
includes the trained graders. Add `WITH_ML=false` for a small image without torch. If port 5432 is
taken, set `DB_HOST_PORT`.

## Local Development Setup

### 1. Database (Docker)

```bash
cp .env.example .env
docker compose up -d
```

> If your host kernel lacks `nf_tables`/`ip_tables` netfilter modules, Docker's daemon cannot
> start (`iptables: Failed to initialize nft: Protocol not supported`). Run Docker on a host/VM
> with those kernel modules available, or install PostgreSQL + PostGIS natively as a fallback.

### 2. Django backend

```bash
cd backend-django
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_verticals        # Agriculture + Textiles, grading schemas, pricing rules
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

### 3. FastAPI backend

```bash
cd backend-fastapi
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# optional, real ML grading with the bundled graders (CPU torch):
pip install -r requirements-ml.txt --extra-index-url https://download.pytorch.org/whl/cpu
uvicorn main:app --reload --port 8001
```

### 4. Frontend

```bash
cd web-app
pnpm install
pnpm dev
```

### 5. Seller Android app

Open `seller-app/` in Android Studio, or build via Gradle (needs the Android SDK):

```bash
cd seller-app
./gradlew :app:installDebug
```

The emulator reaches your machine's backends at `10.0.2.2`; for a physical phone, pass
`-PsellerApiUrl=http://<your-LAN-IP>:8000/api/`. See [`seller-app/README.md`](seller-app/README.md)
for offline sync, push notifications (Firebase) and tests.

### 6. Optional integrations

- **Agmarknet mandi prices:** FastAPI ingests prices every 6 hours from data.gov.in's Agmarknet
  resource. It uses the public sample key (10 rows per call) until you set `AGMARKNET_API_KEY`
  (free: register on data.gov.in, then My Account). agmarknet.gov.in itself has no API.
- **Push notifications:** set `FIREBASE_CREDENTIALS_FILE` for Django and add
  `seller-app/app/google-services.json`.
- **Grading models:** graders for both verticals ship in `ml-training/checkpoints/`, and FastAPI uses
  them once `requirements-ml.txt` is installed. See [`ml-training/README.md`](ml-training/README.md) for
  the datasets, results and retraining.

## Tests

```bash
cd backend-django && python manage.py test          # needs Postgres
cd backend-fastapi && pytest                        # needs Postgres with the Django schema
cd web-app && pnpm test && pnpm test:e2e            # e2e needs the stack running on :3000/:8000/:8001
```

## CI / deployment

GitHub Actions (`.github/workflows/`) lint and test both backends and the web app on every push and PR.
They also build and test the seller Android app, check the OpenAPI schemas in `docs/api/` for drift,
and build the three Docker images. `deploy-azure.yml` is a manual deploy to Azure Container Apps; see
[`infra/azure/README.md`](infra/azure/README.md).
