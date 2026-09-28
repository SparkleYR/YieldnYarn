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
web-app/          Next.js 15 — marketing site + buyer/admin/verifier dashboards
seller-app/       Kotlin Android app for sellers (offline-first listing creation)
infra/            IaC + local Postgres init scripts
docs/             Product & planning documentation
```

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
python manage.py createsuperuser
python manage.py runserver 0.0.0.0:8000
```

### 3. FastAPI backend

```bash
cd backend-fastapi
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
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

- **Agmarknet mandi prices:** set `AGMARKNET_API_KEY` (free from data.gov.in); FastAPI ingests
  prices every 6 hours.
- **Push notifications:** set `FIREBASE_CREDENTIALS_FILE` for Django and add
  `seller-app/app/google-services.json`.
- **Trained grading models:** see [`ml-training/README.md`](ml-training/README.md); FastAPI picks up
  checkpoints automatically once `requirements-ml.txt` is installed.

## CI

GitHub Actions workflows in `.github/workflows/` lint and test the Django backend, FastAPI
backend, and Next.js frontend, and build and test the seller Android app, on every push/PR.
