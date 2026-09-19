# MSME Multi-Vertical Commodity Marketplace — Full Implementation Plan

**Scope:** Agriculture + Textiles verticals only (MVP). Solo developer. Fully local build. Azure only in final migration phase.

This is a **single-phase, in-depth implementation plan** covering the entire project end-to-end: system dependencies, monorepo scaffold, both backends (Django + FastAPI), database, the Next.js web frontend (cloned from the Aceternity productized agency template and adapted for the marketplace), the Kotlin seller app, ML grading, and all supporting infrastructure.

> [!IMPORTANT]
> **Frontend approach:** The web-app will be built by 1:1 cloning the layout, animations, and design patterns from the [Aceternity productized agency template](https://productized-agency-template-acetern.vercel.app/) using **free open-source components only** (Aceternity UI, Magic UI, shadcn/ui). All text, imagery, sections, and navigation will be re-skinned for the MSME Marketplace context. No custom UI component design — everything sourced from these three libraries.

---

## Table of Contents

0. [Current Implementation Status](#0-current-implementation-status)
1. [System Dependencies & Environment Setup](#1-system-dependencies--environment-setup)
2. [Monorepo Scaffold & DevOps Foundation](#2-monorepo-scaffold--devops-foundation)
3. [Database Design & Docker Compose](#3-database-design--docker-compose)
4. [Backend — Django (Admin/CRUD/Auth)](#4-backend--django-admincrudauth)
5. [Backend — FastAPI (Compute/ML)](#5-backend--fastapi-computeml)
6. [Frontend — Web App (Next.js) — Landing/Marketing Site](#6-frontend--web-app-nextjs--landingmarketing-site)
7. [Frontend — Web App (Next.js) — Application Pages](#7-frontend--web-app-nextjs--application-pages)
8. [Seller Mobile App (Kotlin/Android)](#8-seller-mobile-app-kotlinandroid)
9. [ML Grading Pipeline](#9-ml-grading-pipeline)
10. [Integration, Testing & Polish](#10-integration-testing--polish)
11. [Azure Production Migration (Phase 7)](#11-azure-production-migration-phase-7)
12. [Pending Work — Prioritized](#12-pending-work--prioritized)

---

## 0. Current Implementation Status

> [!NOTE]
> **Last audited: 2026-09-16.** This section is a snapshot, not a living dashboard — re-verify against the codebase before trusting it if much time has passed.

The general shape of where the project stands: **both backends are further along than the frontend-to-backend wiring**, the **frontend UI is complete for all four roles and its data layer is now almost entirely real** (only the cost-estimator page and a few polish items remain mocked), and **ML and the seller mobile app are pure spec — no code exists for either yet** (by design; explicitly deferred per standing instruction).

| # | Section | Status | One-line summary |
|---|---|---|---|
| 1 | System Dependencies & Env Setup | 🟡 Partial | Django/FastAPI venvs + Node/pnpm done; Kotlin/Gradle/Android SDK not installed (seller app not started). |
| 2 | Monorepo Scaffold & DevOps | 🟡 Mostly done | `docker-compose.yml` and 4 GitHub Actions workflows exist and match the plan; directory structure matches except a naming detail in §2.1 (now corrected below). |
| 3 | Database Design | ✅ Complete | All 8 Django apps' models implemented, migrated, and applied against a live Postgres. |
| 4 | Backend — Django | 🟡 Mostly complete | All apps + endpoints built, RBAC working, JWT auth working. Grading-trigger → FastAPI call is now wired (§4.3); FCM push dispatch remains a stub (needs real Firebase credentials this environment doesn't have). `accounts` gained an admin user-management endpoint (`AdminUserViewSet`) and a platform-stats endpoint (`AdminStatsView`, §12); `catalog` gained a real letter-grade derivation + an enriched `VerificationQueueView` and a `grade`/`seller_name` on `ListingSerializer`; `orders` gained a free-text `Requirement.region` field and denormalized `commodity_name`/`unit`/`seller_name` on `OrderAllocationSerializer`; `disputes` gained denormalized `raised_by_name`/`against_name` — all beyond the original plan, all driven by real frontend wiring needs (§12). **All 8 apps now have test coverage — 102 tests total** (was 21, 2 apps). Found and fixed three real bugs along the way (§12): `IsOwnerOrAdmin` excluded disputes' `against` party from retrieve/update despite the queryset including them in list; grading never advanced `Listing.status`, so a listing could never actually reach the verification queue or a buyer's catalog; accepting a bid never created an `Order`, and any buyer could accept their own bid unilaterally. The notification pipeline (list/read endpoints, FCM-dispatch signal) is now also actually fed by real events — bid placed/accepted/rejected, dispute status changes, grading completing, verifier decisions — rather than being entirely passive. |
| 5 | Backend — FastAPI | 🟡 Partial | Pricing + matching are real and tested, and now include real letter-grade derivation (`grading/grade.py`, §12) and real haversine-distance geo-radius matching (`matching/allocation.py`, §12) — grade-adjustment pricing, `min_grade` matching, and `search_radius_km` filters all actually work end-to-end. **The matching engine is now actually reachable, too** — `POST /compute/matching/allocate` existed, was tested at the pure-function level, and was never once called by anything until this pass wired `orders/views.py:RequirementViewSet.trigger_match` to call it (§12); it also now correctly decrements the `Listing`s it allocates from (previously didn't, so the same stock could be "matched" repeatedly). Grading itself still runs an interim OpenCV heuristic, not real ML inference. `ingest_agmarknet_prices` scheduler job is a stub (real integration needs the actual Agmarknet API docs, not a guess). **`grading/`, `pricing/`, `scheduler/`, and `matching/router.py` now have test coverage — 44 tests total** (was 14, 2 modules). Writing them surfaced and fixed ~10 real `db.py` SQLAlchemy-vs-Postgres schema drift bugs (missing/wrongly-nullable columns) that had never been hit because nothing FastAPI-side had inserted through those models before; the same class of bug was proactively avoided for the new `Requirement.region` column this pass. |
| 6 | Frontend — Marketing/Landing | ✅ Complete | All 5 pages built per the section-by-section clone plan. |
| 7 | Frontend — Application Pages | ✅ Fully wired to real data | Auth is real (hits Django JWT). Every admin/verifier page (pricing, verticals, users, verification queue, dashboard, disputes) and every buyer page (dashboard, catalog list/detail, requirements + post-requirement dialog, orders, notifications, Buy Now/Place a Bid, cost estimator) now reads and writes through real Django/FastAPI endpoints (§12) — verified end-to-end in a real browser against live Postgres for every flow (bid creation, requirement posting with the new region field, notification read-state, dispute resolve/escalate, admin stats, grade/quantity-adjusted cost estimates). `lib/mock-data.ts` no longer exists — nothing in the app reads from it anymore. Also gained a real `/forgot-password`→`/reset-password` flow and a global Command palette (⌘K, §12) — the latter's own E2E test caught a real bug where sellers could never actually log into the web UI at all (infinite loading skeleton, fixed). |
| 8 | Seller Mobile App (Kotlin) | ⬜ Not started | No code, no directory. Explicitly out of scope for now. |
| 9 | ML Grading Pipeline | 🟡 ~30% | OpenCV preprocessing is real and live; the classifier is a never-run placeholder with no dataset or trained weights. |
| 10 | Integration, Testing & Polish | 🟡 Core paths integrated and tested | Every role's core flow is integrated end-to-end (§7), including both real paths into an `Order` now — direct bid acceptance and requirement-based matching — plus a real password-reset flow and a working seller login (previously broken, see below). Test coverage: 115 Django tests, 44 FastAPI tests, 26 Vitest tests, 14 Playwright E2E tests across 5 specs (§12). The Playwright suite drives real multi-role flows through actual browser UI and has caught **six** real bugs across three passes: grading never advancing listing status; bid acceptance never creating an order (plus a missing seller-only permission check on it); the matching engine never being called at all, and never decrementing what it allocated; a verifier's "Confirm AI Grade" silently blanking a listing's `attribute_scores`; and — the most serious one — sellers being unable to log into the web app at all (an infinite loading skeleton from a role-check bug in `app/buyer/layout.tsx`, never caught before because no test had ever driven a seller's UI login, only their API token). The notification pipeline now has real trigger points (bid/dispute/grading/verification/matching events) instead of being entirely passive. Performance validation (§10.3) still not started — no real traffic/data to measure against yet. |
| 11 | Azure Production Migration | ⬜ Not started (by design) | Correctly deferred — untouched until local dev is complete, per the plan's own instruction. |

---

## 1. System Dependencies & Environment Setup

> **Status:** 🟡 Partial. Docker/Postgres, Python venvs (Django + FastAPI), and Node/pnpm are all set up and working. Kotlin, Gradle, and the Android SDK have **not** been installed — the seller app hasn't been started.

### 1.1 Packages Requiring Root (`sudo pacman -S`)

| Package | Purpose | Install Command |
|---|---|---|
| Docker | Container runtime for PostgreSQL, all services | `sudo pacman -S docker` |
| Docker Compose (plugin) | Multi-container orchestration | `sudo pacman -S docker-compose` |
| PostgreSQL client (`psql`) | DB debugging, migrations, CLI access | `sudo pacman -S postgresql` (client-only) |
| Kotlin compiler | Seller-app compilation | `sudo pacman -S kotlin` |
| Gradle | Kotlin/Android build system | `sudo pacman -S gradle` |
| PostGIS (via Docker) | Spatial queries — runs inside Docker, no host install needed | — |

**Post-install steps:**
```bash
# Enable & start Docker daemon
sudo systemctl enable --now docker
# Add user to docker group (avoids sudo for docker commands)
sudo usermod -aG docker sparkle
# Log out and back in for group to take effect
```

### 1.2 Packages NOT Requiring Root (user-space)

| Package | Purpose | Install Method |
|---|---|---|
| SDKMAN | Manage Kotlin/Gradle versions | `curl -s "https://get.sdkman.io" \| bash` |
| Android SDK + `sdkmanager` | Build Kotlin Android app | Via SDKMAN or manual download to `~/Android/Sdk` |
| Android SDK Build Tools, Platform Tools | Compile APKs | `sdkmanager "build-tools;35.0.0" "platforms;android-35"` |
| pnpm | Package manager for Next.js frontend | `npm i -g pnpm` |
| Python venv | Isolated Python environments for Django/FastAPI | `python3 -m venv .venv` (per-project) |
| Django + DRF + deps | Django backend | `pip install` inside venv |
| FastAPI + Uvicorn + deps | FastAPI backend | `pip install` inside venv |
| PyTorch + OpenCV + Ultralytics | ML grading | `pip install` inside venv (CUDA-enabled) |

### 1.3 Python Virtual Environment & Dependencies

**Backend venv** (shared by both Django and FastAPI, same DB):

```
# backend-django/requirements.txt (core)
# Actually installed: Django resolves to 6.1 under this open-ended pin (Python 3.14.7 venv).
Django>=5.2
djangorestframework>=3.15
djangorestframework-simplejwt>=5.4
django-storages>=1.14
django-cors-headers>=4.6
psycopg[binary]>=3.2
Pillow>=12.0
django-filter>=24.0
gunicorn>=23.0

# backend-fastapi/requirements.txt (core)
fastapi>=0.115
uvicorn[standard]>=0.34
sqlalchemy>=2.0
psycopg[binary]>=3.2
APScheduler>=3.11
python-multipart>=0.0.20
httpx>=0.28
pydantic>=2.10
pydantic-settings>=2.7

# ml-training/requirements.txt
torch>=2.6
torchvision>=0.21
opencv-python>=4.11
ultralytics>=8.3
numpy>=2.2
matplotlib>=3.10
scikit-learn>=1.6
```

### 1.4 Node.js / Frontend Dependencies

```
# Installed via pnpm inside web-app/ — actual versions as built:
next@16.3.3         # App Router, Turbopack (plan originally targeted 15)
react@19.2.8
react-dom@19.2.8
typescript@5
tailwindcss@4        # v4 (CSS-first config)
@tailwindcss/postcss
motion@13            # (formerly framer-motion) — for Aceternity components
clsx
tailwind-merge
lucide-react
@tabler/icons-react   # icons (used by Aceternity components)
react-hook-form + @hookform/resolvers + zod   # forms/validation (added; not in original plan list)
sonner                # toasts (added)
next-themes           # theme handling (added)
cobe                  # WebGL globe for the marketing bento grid (added)
```

> [!NOTE]
> `next-i18next` (Hindi/English i18n) is **not installed** — it was planned for Phase F7 polish (§6.7) but hasn't been reached; see §12 pending work.

---

## 2. Monorepo Scaffold & DevOps Foundation

> **Status:** 🟡 Mostly done. `docker-compose.yml` (§2.2) and all 4 GitHub Actions workflows (§2.3) exist and match this plan. The directory structure matches too, **except** the frontend route-group naming below has been corrected — see the note under §2.1. `seller-app/` doesn't exist yet (correctly deferred, not a bug).

### 2.1 Directory Structure

> [!NOTE]
> **Correction (frontend route groups):** the original tree below used `app/(admin)/` and `app/(verifier)/` — Next.js route **groups** (parens), which do **not** add a URL segment. That would have collapsed those pages to the wrong URLs (e.g. `/verticals` instead of `/admin/verticals`). The actual build correctly used real segment folders — `app/admin/` and `app/verifier/` (no parens) — alongside `app/buyer/` (also a real segment, not `(buyer)`), while `(marketing)` and `(auth)` remain genuine route groups since those routes don't need a role prefix. The tree below reflects what was actually built.

```
project/
├── backend-django/
│   ├── manage.py
│   ├── requirements.txt
│   ├── core/                    # Django project settings
│   │   ├── settings.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   ├── accounts/                # User model, JWT auth, RBAC
│   ├── config/                  # Vertical config (grading schemas, pricing rules)
│   ├── catalog/                 # Listings, grading evidence, catalog browsing
│   ├── orders/                  # Orders, allocations, requirements, bids
│   ├── disputes/                # Dispute handling workflow
│   ├── notifications/           # In-app notifications + FCM dispatch
│   ├── pricing/                 # Price points (Agmarknet/admin-entered/CCI) — built; not in original app list
│   └── reputation/              # Trust/reputation scores — built; not in original app list
│
├── backend-fastapi/
│   ├── main.py
│   ├── requirements.txt
│   ├── grading/                 # AI grading service
│   │   └── models/              # Pretrained weights, OpenCV pipeline
│   ├── pricing/                 # Price calculators, market price feeds
│   ├── matching/                # Matching engine, allocation algorithm
│   └── scheduler/               # APScheduler jobs (price ingestion)
│
├── ml-training/                 # Notebooks/scripts for model fine-tuning
│   ├── notebooks/
│   ├── scripts/
│   └── requirements.txt
│
├── web-app/                     # Next.js 16.3.3 (buyer + admin + verifier + landing)
│   ├── app/                     # App Router pages
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── (marketing)/         # Route group (no URL segment) — landing page + sub-pages
│   │   │   ├── page.tsx         # / — home
│   │   │   ├── pricing/
│   │   │   ├── services/        # (renamed from template's "products")
│   │   │   ├── verticals/       # (renamed from template's "work")
│   │   │   └── blog/
│   │   ├── (auth)/              # Route group (no URL segment) — login, register
│   │   │   ├── login/
│   │   │   └── register/
│   │   ├── buyer/               # REAL segment folder → /buyer/* (not a route group — see note above)
│   │   │   ├── dashboard/
│   │   │   ├── catalog/[id]/
│   │   │   ├── requirements/
│   │   │   ├── orders/
│   │   │   ├── estimate/
│   │   │   └── notifications/
│   │   ├── admin/                # REAL segment folder → /admin/*
│   │   │   ├── dashboard/
│   │   │   ├── verticals/[id]/
│   │   │   ├── verification/
│   │   │   ├── disputes/
│   │   │   ├── users/
│   │   │   └── pricing/
│   │   └── verifier/             # REAL segment folder → /verifier/*
│   │       ├── dashboard/
│   │       └── queue/[id]/
│   ├── components/
│   │   ├── ui/                  # Aceternity UI + Magic UI + shadcn base components
│   │   ├── marketing/           # Landing page section components
│   │   ├── buyer/               # Buyer-specific components
│   │   ├── admin/               # Admin-specific components
│   │   ├── verifier/            # Verifier-specific components (built; not in original list)
│   │   ├── verification/        # Shared admin/verifier review-dialog components (built; not in original list)
│   │   └── shared/               # Shared components (navbar, footer, dashboard shell, stat tiles, etc.)
│   ├── lib/
│   │   ├── utils.ts             # cn() utility
│   │   ├── constants.ts         # Site content data
│   │   ├── api.ts               # API client (Django + FastAPI)
│   │   └── auth.ts              # JWT token management
│   ├── public/
│   │   ├── logos/               # Partner/vertical logos
│   │   ├── projects/            # Showcase images
│   │   ├── assets/              # General assets
│   │   └── blog/                # Blog post images
│   ├── next.config.ts
│   ├── tailwind.config.ts       # Tailwind v4 config
│   ├── tsconfig.json
│   └── package.json
│
├── seller-app/                  # Kotlin Android app
│   ├── app/
│   │   └── src/
│   │       ├── main/
│   │       │   ├── java/com/msme/seller/
│   │       │   ├── res/
│   │       │   └── AndroidManifest.xml
│   │       └── test/
│   ├── build.gradle.kts
│   └── gradle/
│
├── infra/                       # IaC (Bicep/Terraform) — migration time only
├── docs/                        # Project documentation
│   ├── MSME_Marketplace_Project_Document.md
│   ├── MSME_Marketplace_Build_Plan.md
│   └── api/                     # API documentation
│
├── docker-compose.yml           # PostgreSQL + PostGIS + dev services
├── .env.example
├── .gitignore
├── README.md
└── .github/
    └── workflows/
        ├── lint-backend.yml
        ├── test-backend.yml
        ├── lint-frontend.yml
        └── test-frontend.yml
```

### 2.2 Docker Compose (Local Dev)

```yaml
# docker-compose.yml
services:
  db:
    image: postgis/postgis:17-3.5
    container_name: msme-postgres
    environment:
      POSTGRES_DB: msme_marketplace
      POSTGRES_USER: msme_dev
      POSTGRES_PASSWORD: ${DB_PASSWORD:-devpassword}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./infra/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U msme_dev -d msme_marketplace"]
      interval: 10s
      retries: 5

  media:
    image: busybox
    volumes:
      - media_storage:/media
    command: "true"

volumes:
  pgdata:
  media_storage:
```

### 2.3 GitHub Actions (CI from Day 1)

- **Backend lint:** `ruff check` + `mypy` on both Django and FastAPI
- **Backend test:** `pytest` with PostgreSQL service container
- **Frontend lint:** `eslint` + `tsc --noEmit`
- **Frontend test:** Vitest for component tests (later)

---

## 3. Database Design & Docker Compose

> **Status:** ✅ Complete. All 8 Django apps' models are implemented and match the schema below closely, migrated, and confirmed applied against a live Postgres instance (`manage.py showmigrations` shows every migration checked off). Location fields use plain lat/lng `FloatField` pairs rather than PostGIS `Point` (see §3.1 note below) — a deliberate simplification to avoid a GDAL/GEOS dev dependency, documented in `backend-django/README.md`.

### 3.1 Core Schema (Django-owned, FastAPI reads directly)

All tables use Django ORM models. FastAPI reads via SQLAlchemy (read-only on most tables) or direct `psycopg` for performance-critical paths.

#### Users & Auth
- `users` — id, email, phone, password_hash, role (enum: SELLER, BUYER, ADMIN, VERIFIER), is_active, created_at
- `user_profiles` — user_id (FK), display_name, avatar_url, preferred_language, location (PostGIS Point)

#### Vertical Configuration (the plug-in point)
- `verticals` — id, name, slug, unit_of_measure, is_active, created_at
- `grading_schemas` — id, vertical_id (FK), attribute definitions (JSONB: name, type, range, ideal values, weight, `gradeable_by_ml` flag)
- `pricing_rules` — id, vertical_id (FK), rule set (JSONB: grade-adjustment table, quantity-tier table)

#### Catalog & Grading
- `listings` — id, seller_id (FK), vertical_id (FK), commodity_name, sub_category, quantity, unit, price_suggested, price_final, location (PostGIS Point), status (enum: DRAFT, PENDING_GRADING, PENDING_VERIFICATION, ACTIVE, SOLD, EXPIRED), created_at, updated_at
- `grading_evidence` — id, listing_id (FK), file_path, file_type (enum: IMAGE, VIDEO, DOCUMENT), uploaded_at
- `grading_results` — id, listing_id (FK), source (enum: AI, VERIFIER), confidence_score (float), attribute_scores (JSONB), graded_by (FK to user, nullable for AI), created_at, notes

#### Pricing & Market Data
- `price_points` — id, vertical_id (FK), commodity, region, price, source (enum: AGMARKNET, ADMIN_ENTERED, CCI), timestamp, raw_data (JSONB)

#### Orders & Matching
- `requirements` — id, buyer_id (FK), vertical_id (FK), commodity, quantity, min_grade, max_price, budget, region (PostGIS), status (enum: OPEN, MATCHED, FULFILLED, CANCELLED), created_at
- `orders` — id, requirement_id (FK, nullable), buyer_id (FK), status (enum: PENDING, CONFIRMED, FULFILLED, DISPUTED, CANCELLED), total_price, created_at
- `order_allocations` — id, order_id (FK), listing_id (FK), allocated_quantity, unit_price, status

#### Trust & Reputation
- `reputation_scores` — id, user_id (FK), role, score (float), grade_accuracy_score, fulfillment_score, payment_score, total_transactions, last_updated

#### Disputes
- `disputes` — id, order_id (FK), raised_by (FK), against (FK), type (enum: GRADE_MISMATCH, QUANTITY_SHORTAGE, QUALITY_DEFECT, OTHER), status (enum: OPEN, UNDER_REVIEW, RESOLVED, ESCALATED), description, evidence_refs (JSONB), resolution_notes, created_at, resolved_at

#### Notifications
- `notifications` — id, user_id (FK), type (enum: GRADING_COMPLETE, ORDER_MATCHED, BID_RECEIVED, DISPUTE_UPDATE, SYSTEM), title, message, related_object_type, related_object_id, is_read, fcm_sent, created_at

#### Bids / Negotiation
- `bids` — id, listing_id (FK), buyer_id (FK), offered_price, offered_quantity, status (enum: PENDING, ACCEPTED, REJECTED, COUNTERED, EXPIRED), parent_bid_id (FK, nullable for counter-offers), message, created_at

### 3.2 Indexes & Extensions

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Key indexes
CREATE INDEX idx_listings_vertical_status ON listings(vertical_id, status);
CREATE INDEX idx_listings_location ON listings USING GIST(location);
CREATE INDEX idx_listings_commodity_trgm ON listings USING GIN(commodity_name gin_trgm_ops);
CREATE INDEX idx_price_points_lookup ON price_points(vertical_id, commodity, region, timestamp DESC);
CREATE INDEX idx_requirements_status ON requirements(status, vertical_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
```

---

## 4. Backend — Django (Admin/CRUD/Auth)

> **Status:** 🟡 Mostly complete. All 8 apps are wired into `INSTALLED_APPS`, `manage.py check` is clean, and JWT auth (simplejwt) is fully working. Two integration points are explicit, README-acknowledged stubs (see §4.3 note). Test coverage is thin: only `accounts` has real tests (2 methods, a register→login→/me/ smoke test); the other 7 apps are untested default stub files.

### 4.1 Apps & Responsibilities

| Django App | Models | Responsibilities |
|---|---|---|
| `accounts` | User, UserProfile | Registration, JWT auth (SimpleJWT), RBAC (4 roles), profile management |
| `config` | Vertical, GradingSchema, PricingRule | Vertical CRUD, grading schema editor, pricing rule editor (Admin-only) |
| `catalog` | Listing, GradingEvidence, GradingResult | Listing CRUD, evidence upload (→ local disk via `django-storages`), grading result storage, catalog search/filter API |
| `orders` | Requirement, Order, OrderAllocation, Bid | Requirement posting, order creation, allocation records, bid/negotiation workflow |
| `disputes` | Dispute | Dispute creation, status transitions, evidence attachment, resolution |
| `notifications` | Notification | Create/read/mark-read notifications, FCM push dispatch |
| `pricing` | PricePoint | Price-point storage (Agmarknet/admin-entered/CCI), read by FastAPI's pricing service — **built but not in the original app table** |
| `reputation` | ReputationScore | Per-user trust/reputation scores — **built but not in the original app table** |

### 4.2 API Endpoints (DRF)

```
# Auth
POST   /api/auth/register/
POST   /api/auth/login/          → JWT access + refresh tokens
POST   /api/auth/refresh/
GET    /api/auth/me/

# Config (Admin only)
GET    /api/config/verticals/
POST   /api/config/verticals/
GET    /api/config/verticals/{id}/
PUT    /api/config/verticals/{id}/
GET    /api/config/verticals/{id}/grading-schema/
PUT    /api/config/verticals/{id}/grading-schema/
GET    /api/config/verticals/{id}/pricing-rules/
PUT    /api/config/verticals/{id}/pricing-rules/

# Catalog
GET    /api/catalog/listings/              → filtered, paginated, searchable
POST   /api/catalog/listings/              → seller creates listing
GET    /api/catalog/listings/{id}/
PUT    /api/catalog/listings/{id}/
POST   /api/catalog/listings/{id}/evidence/  → file upload
GET    /api/catalog/listings/{id}/grading/
POST   /api/catalog/listings/{id}/grading/trigger/  → triggers FastAPI grading

# Orders
GET    /api/orders/requirements/
POST   /api/orders/requirements/
GET    /api/orders/orders/
GET    /api/orders/orders/{id}/
POST   /api/orders/bids/
PUT    /api/orders/bids/{id}/

# Verification queue (Verifier + Admin)
GET    /api/verification/queue/
POST   /api/verification/queue/{listing_id}/review/

# Disputes
GET    /api/disputes/
POST   /api/disputes/
PUT    /api/disputes/{id}/

# Notifications
GET    /api/notifications/
POST   /api/notifications/{id}/read/
POST   /api/notifications/read-all/

# Reputation
GET    /api/reputation/{user_id}/
```

### 4.3 Key Implementation Details

> **Status:** RBAC, file upload, the offline-sync field, and the grading-trigger call are built as planned. FCM dispatch remains a stub — see the ⚠️ note below.

- **RBAC:** ✅ Built via `core/permissions.py` — 9 permission classes (`IsAdmin`, `IsSeller`, `IsBuyer`, `IsVerifier`, `IsVerifierOrAdmin`, `IsAdminOrReadOnly`, `IsListingOwnerOrReadOnly`, `IsOwnerOrAdmin`, `IsBidPartyOrAdmin`), applied per-viewset. Sellers can only CRUD their own listings. Buyers can only see ACTIVE listings. Admins see everything. Verifiers see only the verification queue.
- **File upload:** ✅ Built. `django-storages` with `FileSystemStorage` backend locally (Docker volume at `/media`). Swappable to `AzureBlobStorage` via settings — no code changes planned at migration time.
- **Seller-app sync:** ✅ Built on the Django side — `Listing.client_uuid` exists specifically for idempotent creation via `POST /api/catalog/listings/` on reconnection. The Kotlin app itself that would exercise this is not built (§8).
- **FCM dispatch:** ⚠️ **Stub.** `notifications/signals.py`'s `dispatch_fcm_on_notification_create` (post_save signal on `Notification`) currently only logs a `TODO(FCM)` message instead of calling the Firebase Admin SDK. See §12.
- **Grading trigger:** ✅ **Wired**, not in the original plan text but worth noting here since it's the Django↔FastAPI seam: `POST /api/catalog/listings/{id}/grading/trigger/` (`catalog/views.py:68`) calls FastAPI's `POST /compute/grading/grade` via `httpx` (base URL from `settings.FASTAPI_BASE_URL`, env `FASTAPI_BASE_URL`, default `http://localhost:8001`) and proxies its response back with `200`. Returns `503` if the FastAPI service is unreachable, `502` if it responds with an error. Verified with a real end-to-end call (not just mocked tests) — see `catalog/tests.py:GradingTriggerTest`.

---

## 5. Backend — FastAPI (Compute/ML)

> **Status:** 🟡 Partial. Pricing and matching are fully real and match this plan closely. Grading and one scheduler job are interim stubs — see the notes under §5.1, §5.3 (grading), and §5.4.

### 5.1 Services

| Module | Endpoints | Responsibilities | Status |
|---|---|---|---|
| `grading` | `POST /grading/grade` | Receives listing_id, fetches evidence from DB, runs ML on `gradeable_by_ml` attributes, writes results to `grading_results` | 🟡 Runs a real OpenCV edge-density heuristic (`grading/pipeline.py`) as an explicit interim proxy — `requirements-ml.txt` (torch/opencv/ultralytics) isn't installed in this env, so it never reaches real MobileNetV3/YOLOv8n inference. `CONFIDENCE_VERIFICATION_THRESHOLD = 0.80` is implemented as planned. |
| `pricing` | `GET /pricing/base-price`, `GET /pricing/adjusted-price`, `GET /pricing/cost-estimate`, `GET /pricing/trends` | Base price lookup, grade-adjusted calculator, quantity-tiered calculator, cost estimator, historical trend data | ✅ Fully real (`pricing/service.py` + `pricing/router.py`). Letter-grade derivation is now real too (`grading/grade.py`, §12) — grade-adjustment multipliers actually apply. One TODO remains: region-label derivation from lat/lng. |
| `matching` | `POST /matching/find-matches`, `POST /matching/allocate` | Matches requirements to listings, runs multi-listing allocation algorithm | ✅ Fully real (`matching/allocation.py`, pure/DB-decoupled). Grade derivation is real (§12) — `min_grade` filtering actually excludes lower-graded listings, verified against real cheaper-but-lower-graded listings losing to more expensive higher-graded ones. Real haversine-distance geo-radius filtering is also live (`Requirement.search_radius_km`, §12) — no TODO remains here. |
| `scheduler` | Internal (APScheduler) | Agmarknet data ingestion (cron), price data cleanup | 🟡 Split status — see §5.4. |

### 5.2 Key API Endpoints

```
# Grading
POST   /compute/grading/grade          → {listing_id} → triggers async ML grading
GET    /compute/grading/status/{id}    → grading job status

# Pricing
GET    /compute/pricing/base           → ?vertical=agriculture&commodity=wheat&region=UP
GET    /compute/pricing/adjusted       → ?listing_id=123
GET    /compute/pricing/estimate       → ?vertical=agriculture&commodity=wheat&quantity=50&min_grade=A
GET    /compute/pricing/trends         → ?vertical=agriculture&commodity=wheat&region=UP&days=30

# Matching
POST   /compute/matching/find          → {requirement_id} → returns matching listings
POST   /compute/matching/allocate      → {requirement_id, strategy} → runs allocation, creates order
```

### 5.3 Multi-Listing Allocation Algorithm

The most algorithmically nontrivial piece — a constrained optimization:

**Input:** Buyer requirement (quantity Q, min grade G, max price P, region R)
**Available:** Set of listings L meeting grade ≥ G and within region R

**Objective:** Minimize total cost while fulfilling quantity Q

**Approach:**
1. Filter listings by grade ≥ G, region ≤ R radius, status = ACTIVE
2. Sort by effective unit price (grade-adjusted) ascending
3. Greedy allocation: fill from cheapest first
4. Tie-break by seller reputation score (trust-weighted allocation)
5. Partial allocation: if total available < Q, offer partial fill with buyer confirmation
6. Output: list of (listing_id, allocated_quantity, unit_price) tuples

> [!NOTE]
> Start with greedy. Consider knapsack/LP only if the greedy solution produces meaningfully suboptimal results in testing — unlikely at pilot scale with 2 verticals.

> **Status:** ✅ Implemented exactly as specified — `matching/allocation.py`'s `greedy_allocate()` filters by status/region/price/grade, sorts by price ascending then reputation descending, and fills greedily, with dataclasses `ListingOffer`/`Allocation`/`AllocationResult` (the latter exposing `.shortfall`/`.fully_fulfilled` for the partial-allocation case). 5 unit tests cover exact fulfillment, partial fulfillment, reputation tie-break, min-grade filtering, and inactive-listing exclusion.

### 5.4 APScheduler Jobs

```python
# Agmarknet price ingestion — runs every 6 hours
scheduler.add_job(ingest_agmarknet_prices, 'interval', hours=6)

# Textiles — manual/admin-entered, no scheduled job needed yet

# Stale listing cleanup — runs daily
scheduler.add_job(expire_stale_listings, 'cron', hour=2, minute=0)
```

> **Status:** Both jobs are registered in `main.py`'s lifespan handler exactly per this schedule, but only one does real work:
> - `expire_stale_listings` — ✅ **Real.** Runs a bulk SQL `UPDATE` marking ACTIVE listings older than `STALE_LISTING_DAYS = 30` as EXPIRED, with `SQLAlchemyError` handling.
> - `ingest_agmarknet_prices` — ⚠️ **Stub.** Only logs an info message; makes no HTTP call to Agmarknet and writes nothing to `price_points`. See §12.

---

## 6. Frontend — Web App (Next.js) — Landing/Marketing Site

> **Status:** ✅ Complete. All 5 pages (home + `/verticals`, `/services`, `/pricing`, `/blog`) are built, following the section-by-section clone plan below closely. Built on Next.js 16.3.3 / React 19.2.8 (ahead of the versions named in §6.1 — see the correction there). The newsletter signup form (`components/marketing/newsletter-form.tsx`) is a TODO stub — no real list to wire it to yet.

> [!IMPORTANT]
> **This is the massive frontend planning section.** The landing site (marketing pages) will be a 1:1 clone of the [Aceternity productized agency template](https://productized-agency-template-acetern.vercel.app/), re-skinned for the MSME Marketplace. Every UI component is sourced from **Aceternity UI** (free), **Magic UI**, or **shadcn/ui** — no custom design from scratch.

### 6.0 Frontend Plan File

The complete frontend implementation plan is maintained as a separate, detailed file:

📄 **[frontend_plan.md](file:///home/sparkle/.gemini/antigravity/brain/72a200ee-61b0-48fb-97f0-27020806277d/frontend_plan.md)** — Contains:
- Section-by-section breakdown of every page
- Exact component mapping (template → MSME marketplace)
- Content adaptation table
- Animation specifications
- Color scheme / design tokens
- File-by-file implementation order
- Component dependency graph

### 6.1 Tech Stack & Setup

| Technology | Planned Version | Actually Installed | Purpose |
|---|---|---|---|
| Next.js | 15 (App Router, Turbopack) | **16.3.3** | Framework |
| React | 19 | **19.2.8** | UI library |
| TypeScript | Latest | 5 | Type safety |
| Tailwind CSS | 4.0 | 4 | Styling (CSS-first config) |
| `motion` | Latest | 13 | Animations (Aceternity components need this) |
| `clsx` + `tailwind-merge` | Latest | ✅ installed | Class merging utility (`cn()`) |
| `lucide-react` | Latest | ✅ installed | Primary icon library |
| `@tabler/icons-react` | Latest | ✅ installed | Secondary icons (Aceternity compat) |
| `next-i18next` | Latest | ⬜ **not installed** | i18n / multilingual — deferred to Phase F7 polish, not yet reached |
| pnpm | Latest | 11.24.0 | Package manager |
| `react-hook-form` + `zod` | *(not in original plan)* | ✅ installed | Form validation — used across auth + all admin/buyer forms |
| `sonner` | *(not in original plan)* | ✅ installed | Toast notifications |

### 6.2 Design System — Adapted from Template

#### Color Palette (MSME Marketplace Branding)

The template uses a gold/amber accent (`#FA9A63`, `#CDA63C`) on black. We'll adapt to a **green/teal** theme reflecting agriculture/trade, keeping the dark-mode-first approach:

| Token | Template Value | MSME Marketplace Value | Usage |
|---|---|---|---|
| `--background` | `#0a0a0a` (neutral-950) | `#0a0a0a` | Page background (keep dark) |
| `--surface` | `#171717` (neutral-900) | `#171717` | Card backgrounds |
| `--border` | `#262626` (neutral-800) | `#262626` | Card borders |
| `--primary` | `#FA9A63` (gold/amber) | `#10B981` (emerald-500) | CTAs, accents, highlights |
| `--primary-glow` | `#CDA63C` | `#059669` (emerald-600) | Glow effects |
| `--heading` | `#FFFFFF` | `#FFFFFF` | Headings |
| `--body` | `#a3a3a3` (neutral-400) | `#a3a3a3` | Body text |
| `--muted` | `#737373` (neutral-500) | `#737373` | Muted/secondary text |
| `--natural-white` | `#fafafa` | `#fafafa` | Pure white text |
| `--offwhite` | `#f5f5f0` (warm off-white) | `#f5f5f0` | Light section backgrounds |

> [!NOTE]
> **User Review Required:** The color palette above adapts the template's gold/amber to emerald/green for an agriculture/trade feel. If you prefer a different accent color (blue for trust, orange for energy, etc.), let me know before implementation.

#### Typography

| Font | Usage | Source |
|---|---|---|
| **Inter** | Primary sans-serif (headings + body) | Google Fonts (preloaded) |
| **Geist Mono** | Code snippets, data labels, monospace accents | `next/font` |
| **DM Mono** | Small caps labels (like "Trusted by" section headers) | Google Fonts |

### 6.3 Pages — Template → MSME Mapping

The marketing site has **5 pages** that map directly from the template:

| Template Page | MSME Marketplace Page | Route | Purpose |
|---|---|---|---|
| `/` (Home) | `/` (Home) | `/` | Landing page — hero, trust logos, features, showcase, testimonials, pricing overview, CTA |
| `/work` | `/verticals` | `/verticals` | Showcase the 2 (expandable) verticals with real commodity examples |
| `/products` | `/services` | `/services` | Explain the 3 core platform services: grading, pricing, matching |
| `/pricing` | `/pricing` | `/pricing` | Pricing tiers for marketplace participation |
| `/blog` | `/blog` | `/blog` | Blog/insights about market trends, MSME updates |

### 6.4 Home Page — Section-by-Section Clone Plan

Based on the template screenshots and HTML analysis:

#### Section 1: Navbar
- **Template:** Floating navbar — Logo | Work, Products, Pricing, Blog | "Chat with Alex" CTA button
- **MSME:** Floating navbar — MSME Logo | Verticals, Services, Pricing, Blog | "Get Started" CTA button
- **Component:** Aceternity UI `FloatingNavbar` (free) or custom with `motion` animations
- **Details:** 
  - Blur backdrop (`backdrop-blur-md`)
  - Absolute positioned, `z-50`, appears on scroll
  - Mobile: hamburger menu with slide-in drawer
  - CTA button with animated icon box (the distinctive dot-matrix → avatar animation from template)
  - **MSME adaptation:** Replace "Chat with Alex" with "Start Selling" or "Get Started", replace avatar with a commodity icon

#### Section 2: Hero Section
- **Template:** Full-height dark hero with:
  - Animated grid/dot-matrix background (subtle, upper portion)
  - Glowing elliptical arc (gold/amber gradient) at bottom
  - Star/particle field overlay
  - Badge pill ("Aceternity UI — New components every week")
  - Two-column layout: Large heading (left) + description + CTA (right)
  - Giant faded brand text at very bottom ("Aceternity")
- **MSME adaptation:**
  - Badge: "MSME Marketplace — Empowering Indian producers"
  - Heading: "The smartest way to trade commodities across India."
  - Description: "AI-graded quality. Real-time pricing. Multi-seller order fulfillment. Built for MSME producers and buyers."
  - CTA: "Start Selling" button (same animated style)
  - Giant faded text: "MSME Marketplace" or "MSMETrade"
  - Arc color: emerald/green gradient instead of gold
- **Components:**
  - Custom SVG arc (clone from template — it's inline SVG with gradient `linearGradient`)
  - Aceternity `Spotlight` or `BackgroundBeams` for ambient lighting
  - `motion` for fade-in animations
  - Dot grid/particle SVG (clone from template inline SVG)

#### Section 3: Logo Cloud / Trust Strip
- **Template:** "Trusted by fast-growing startups" + 15 grayscale company logos in a grid
- **MSME adaptation:** "Trusted by India's MSME ecosystem" + logos of relevant organizations:
  - MSME Ministry logo, NSIC, Agmarknet, APEDA, BIS, Textile Commissioner, KVIC, SIDBI
  - Use real government/industry logos (publicly available)
- **Component:** Aceternity `InfiniteMovingCards` (free) for marquee, or static grid matching template
- **Layout:** Grid with `flex-wrap`, logos at `h-4 md:h-6` with opacity/grayscale filter, 3D perspective hover

#### Section 4: Features / Bento Grid — "Replace your Engineering Team"
- **Template:** Large heading + 5-card asymmetric bento grid:
  - Card 1 (tall, left): "Design and Development" — animated browser mockup wireframe, code animation overlay
  - Card 2 (top center): "Regular updates and progress tracking" — donut chart + notification card
  - Card 3 (top right, dark): "Hosting, Deployment & Maintenance" — world map with avatar dots
  - Card 4 (bottom center): "Get found on Google" — Google search UI mockup
  - Card 5 (bottom right): "Components, Dashboards and Everything else" — circuit board pattern with floating element
- **MSME adaptation:** Heading: "Everything MSMEs Need to Trade Smarter"
  - Card 1 (tall, left): **"AI Quality Grading"** — animated mockup of grading interface: photo upload → AI analysis → grade result. Illustrate with a miniature grading card showing confidence bars
  - Card 2 (top center): **"Real-time Price Intelligence"** — donut chart → price trend chart mockup + notification: "Wheat price ↑ 3.2% in Mandi Jaipur"
  - Card 3 (top right, dark): **"Pan-India Reach"** — India map (replace world map) with seller/buyer dots across states. Keep the dark styling + avatar connections
  - Card 4 (bottom center): **"Smart Order Matching"** — mockup showing a buyer requirement → matching engine → multi-seller allocation result
  - Card 5 (bottom right): **"Seller Dashboard & Analytics"** — dashboard wireframe with charts/stats. Keep circuit-board pattern
- **Component:** Aceternity `BentoGrid` / `BentoGridItem` (free)
- **Grid layout:** `grid-cols-19` (matching template's asymmetric layout: col-span-6, col-span-7, col-span-6 etc.)
- **Card internals:** Each card has a custom animated illustration — these are the most implementation-heavy pieces. Use `motion` for the animated mockups.

#### Section 5: Projects / Portfolio Showcase
- **Template:** Grid of 6 project cards — large screenshot images with hover overlay showing project title + tags + "View Project →" link. Mix of light and dark backgrounds.
- **MSME adaptation:** **"See the Platform in Action"** — showcase cards for:
  1. Agriculture vertical: Wheat trading on the platform (grading view)
  2. Textiles vertical: Cotton fabric listing (quality analysis)
  3. Order fulfillment: Multi-seller allocation in action
  4. Price dashboard: Live Agmarknet data visualization
  5. Seller app: Mobile app listing creation (screenshot)
  6. Admin console: Vertical configuration view
- **Component:** Custom cards matching template layout (2-col grid on lg, full-width on sm)
- **Hover:** Image zoom + overlay with "Explore →" and category tags
- **Images:** Generate via `generate_image` tool for polished mockups

#### Section 6: Comparison Table — "Aceternity VS Traditional"
- **Template:** Full-width light-bg (`#f5f5f0`) section with a comparison table:
  - 3 columns: Category | Aceternity Labs ✅ | Traditional Providers ⚠️
  - 7 rows: Approach, Process, Design Philosophy, Development Stack, Communication, Deliverables, Support
- **MSME adaptation:** **"MSME Marketplace VS Traditional Trading"**
  - Columns: Category | MSME Marketplace ✅ | Traditional Commodity Trading ⚠️
  - Rows:
    - Quality Assurance → "AI-verified grading with audit trail" vs "Manual inspection, no records"
    - Pricing → "Real-time market data + grade-adjusted" vs "Opaque, middleman-dependent"
    - Order Fulfillment → "Multi-seller auto-allocation" vs "Single supplier or manual sourcing"
    - Reach → "Pan-India digital marketplace" vs "Local mandi, limited buyers"
    - Trust → "Reputation scoring + dispute resolution" vs "Word of mouth, no recourse"
    - Communication → "Real-time notifications, in-app updates" vs "Phone calls, no tracking"
    - Scale → "Handle 8+ verticals with plug-in config" vs "One commodity, one region"
- **Component:** Custom table component matching the template's clean grid style. Use shadcn `Table` as base with custom styling.

#### Section 7: Testimonials (if present in more screenshots)
- **Template:** Likely uses `InfiniteMovingCards` for testimonial marquee
- **MSME adaptation:** Testimonials from pilot MSME users (can use placeholder quotes initially)
- **Component:** Aceternity `InfiniteMovingCards` or Magic UI `Marquee`

#### Section 8: CTA Section
- **Template:** Dark section with prominent heading + CTA button
- **MSME:** "Ready to transform how you trade?" + "Join the Marketplace" button
- **Component:** Custom dark panel with `Spotlight` or gradient effect

#### Section 9: Footer
- **Template:** Multi-column footer with Logo, nav links (Products, Company, Legal), social icons, copyright
- **MSME adaptation:**
  - Column 1: MSME Marketplace logo + tagline ("Empowering India's producers")
  - Column 2: Platform (Verticals, Services, Pricing)
  - Column 3: Resources (Blog, Documentation, API)
  - Column 4: Legal (Privacy Policy, Terms of Service, Contact)
  - Bottom: Copyright + social icons
- **Component:** Custom footer matching template structure

### 6.5 Sub-Pages Clone Plan

#### `/verticals` page (maps to template's `/work`)
- Hero header: "Our Verticals" + description
- Vertical showcase cards (Agriculture, Textiles) — large cards with:
  - Hero image of the commodity sector
  - Vertical name, key metrics, grading attributes
  - "Explore Listings →" CTA
- Future verticals preview (grayed out): Engineering, Food Processing, etc.
- CTA + Footer

#### `/services` page (maps to template's `/products`)
- Hero header: "Platform Services"
- 3 service cards (full detail):
  1. **AI Grading Engine** — how it works, evidence types, confidence scoring
  2. **Price Intelligence** — market feeds, grade-adjusted pricing, historical trends
  3. **Smart Matching** — requirement posting, allocation algorithm, multi-seller fulfillment
- How It Works (stepped process flow)
- CTA + Footer

#### `/pricing` page (maps to template's `/pricing`)
- Hero: "Simple, Transparent Marketplace Access"
- 3-tier pricing cards:
  - **Starter** (Free): List up to 10 items/month, basic grading, manual pricing
  - **Growth** (₹999/mo): Unlimited listings, AI grading, price intelligence, 5 allocations/month
  - **Enterprise** (Custom): Everything + API access, bulk allocation, dedicated support
- FAQ accordion section
- CTA + Footer
- **Component:** shadcn `Accordion` for FAQ, custom pricing cards matching template style

#### `/blog` page (maps to template's `/blog`)
- Hero: "Insights & Market Intelligence"
- Blog post grid (2-3 columns)
- Card design: thumbnail, category tag, title, excerpt, author, date
- Static initially (hardcoded blog posts about MSME market trends)
- CTA + Footer

### 6.6 Component Sourcing Map

| Component Needed | Source Library | Component Name | Free? |
|---|---|---|---|
| Floating navbar with blur | Aceternity UI | `FloatingNavbar` | ✅ Free |
| Hero spotlight/beams | Aceternity UI | `Spotlight` / `BackgroundBeams` | ✅ Free |
| Text fade-in animation | Aceternity UI | `TextGenerateEffect` | ✅ Free |
| Infinite scrolling cards | Aceternity UI | `InfiniteMovingCards` | ✅ Free |
| Bento grid layout | Aceternity UI | `BentoGrid` / `BentoGridItem` | ✅ Free |
| 3D hover cards | Aceternity UI | `ThreeDCard` | ✅ Free |
| Animated tooltips | Aceternity UI | `AnimatedTooltip` | ✅ Free |
| Sticky scroll reveal | Aceternity UI | `StickyScrollReveal` | ✅ Free |
| Tabs with motion | Aceternity UI | `Tabs` | ✅ Free |
| Wobble card | Aceternity UI | `WobbleCard` | ✅ Free |
| Moving border button | Aceternity UI | `MovingBorder` | ✅ Free |
| Lamp effect heading | Aceternity UI | `LampEffect` | ✅ Free |
| Meteors background | Aceternity UI | `Meteors` | ✅ Free |
| Marquee (logos/testimonials) | Magic UI | `Marquee` | ✅ Free |
| Globe (India map alt.) | Magic UI | `Globe` | ✅ Free |
| Number ticker (stats) | Magic UI | `NumberTicker` | ✅ Free |
| Animated beam | Magic UI | `AnimatedBeam` | ✅ Free |
| Dock (mobile nav) | Magic UI | `Dock` | ✅ Free |
| Button | shadcn/ui | `Button` | ✅ Free |
| Card | shadcn/ui | `Card` | ✅ Free |
| Table | shadcn/ui | `Table` | ✅ Free |
| Accordion (FAQ) | shadcn/ui | `Accordion` | ✅ Free |
| Dialog/Modal | shadcn/ui | `Dialog` | ✅ Free |
| Input / Form | shadcn/ui | `Input`, `Form` | ✅ Free |
| Dropdown Menu | shadcn/ui | `DropdownMenu` | ✅ Free |
| Tabs (base) | shadcn/ui | `Tabs` | ✅ Free |
| Badge | shadcn/ui | `Badge` | ✅ Free |
| Avatar | shadcn/ui | `Avatar` | ✅ Free |
| Toast | shadcn/ui | `Toast` / `Sonner` | ✅ Free |
| Select | shadcn/ui | `Select` | ✅ Free |
| Tooltip | shadcn/ui | `Tooltip` | ✅ Free |

### 6.7 Frontend Implementation Order

```
Phase F1 — Project setup & design system (1 day)
  ├── Next.js 15 + Tailwind v4 + TypeScript scaffold
  ├── pnpm init, install all dependencies
  ├── Configure tailwind.config.ts with MSME color tokens
  ├── Set up cn() utility, global CSS, font loading (Inter, Geist Mono, DM Mono)
  ├── Create public/ directory structure
  └── Install base shadcn/ui components (button, card, input, etc.)

Phase F2 — Copy Aceternity UI + Magic UI components (1–2 days)
  ├── Copy all needed Aceternity UI components into components/ui/
  │   ├── spotlight.tsx
  │   ├── text-generate-effect.tsx
  │   ├── background-beams.tsx
  │   ├── infinite-moving-cards.tsx
  │   ├── bento-grid.tsx
  │   ├── three-d-card.tsx
  │   ├── floating-navbar.tsx
  │   ├── sticky-scroll-reveal.tsx
  │   ├── animated-tooltip.tsx
  │   ├── wobble-card.tsx
  │   ├── moving-border.tsx
  │   ├── lamp-effect.tsx
  │   ├── meteors.tsx
  │   └── tabs.tsx
  ├── Copy Magic UI components
  │   ├── marquee.tsx
  │   ├── globe.tsx
  │   ├── number-ticker.tsx
  │   ├── animated-beam.tsx
  │   └── dock.tsx
  ├── Verify all components render correctly with Tailwind v4
  └── Fix any import/dependency issues

Phase F3 — Navbar + Footer (shared layout) (0.5 day)
  ├── Build marketing/shared Navbar component
  ├── Build Footer component
  ├── Wire into app/layout.tsx
  └── Mobile responsive: hamburger + drawer

Phase F4 — Home page sections (3–4 days)
  ├── Hero section (arc SVG, dot grid, badge, heading, CTA)
  ├── Logo cloud / trust strip
  ├── Bento grid features ("Everything MSMEs Need")
  │   ├── Card 1: AI Grading mockup animation
  │   ├── Card 2: Price chart + notification
  │   ├── Card 3: India map with dots
  │   ├── Card 4: Matching engine mockup
  │   └── Card 5: Dashboard wireframe
  ├── Project showcase grid (6 cards with hover)
  ├── Comparison table section
  ├── Testimonials section
  ├── CTA section
  └── Scroll animations + polish

Phase F5 — Sub-pages (2–3 days)
  ├── /verticals page (showcase + future verticals)
  ├── /services page (3 service cards + how-it-works)
  ├── /pricing page (3 tiers + FAQ accordion)
  └── /blog page (post grid + placeholder content)

Phase F6 — Asset generation (1–2 days)
  ├── Generate hero images via generate_image tool
  ├── Generate project showcase mockups
  ├── Generate vertical hero images (agriculture, textiles)
  ├── Create MSME Marketplace logo
  └── Generate blog post thumbnails

Phase F7 — Polish & responsive (1–2 days)
  ├── Full responsive testing (mobile, tablet, desktop)
  ├── Animation tuning (timing, easing, stagger delays)
  ├── Lighthouse audit (performance, accessibility, SEO)
  ├── Cross-browser testing
  └── i18n setup (next-i18next for Hindi + English)
```

**Total frontend estimate: 10–14 days**

---

## 7. Frontend — Web App (Next.js) — Application Pages

These are the **authenticated, functional pages** that connect to the Django/FastAPI backends. Built after the marketing site is polished.

> **Status:** ✅ UI complete for Buyer/Admin/Verifier (17 routes across the three consoles) / 🟡 data wiring partial. Only auth actually calls the Django backend. Every other page reads from `web-app/lib/mock-data.ts`, deliberately shaped to match the Django serializers so each mock array is a like-for-like swap for a real `djangoApi.get(...)` call later. 7 write-actions are explicitly TODO-seamed (see §12 for the full file:line list): post requirement, buy/bid on a listing, verifier review submit, admin vertical-config save, admin user active-toggle, admin dispute resolve, admin price-point add.

### 7.1 Auth Pages

> **Status:** ✅ Built and real (not mocked). Login/register hit Django's `/api/auth/login/`, `/api/auth/register/`, `/api/auth/me/` for real, session (JWT + user) stored in `localStorage` via `lib/auth.ts`. `dashboardPathForRole()` redirects to the correct console post-login.

| Page | Route | Components | Status |
|---|---|---|---|
| Login | `/login` | Email/phone + password form, JWT storage, role-based redirect | ✅ Built. Also caught and fixed a real bug (§12): sellers logging in got stuck on an infinite loading skeleton — `app/buyer/layout.tsx` only accepted the `BUYER` role even though `dashboardPathForRole` routes sellers to the same `/buyer/dashboard` shell. |
| Register | `/register` | Role selection → profile info; reads `?plan=` query param to default role | ✅ Built (single-step, not multi-step as originally planned) |
| Forgot Password | `/forgot-password` | Email input → reset flow | ✅ Real — `POST /api/auth/password-reset/`, real email (console backend in dev, see §12), real enumeration protection. Paired with `/reset-password` (`?uid=&token=`) to actually complete the flow. |

> [!NOTE]
> **JWT storage is a known, documented tradeoff.** `lib/auth.ts` stores tokens in `localStorage` rather than the httpOnly refresh cookie described in §10.1 — a pragmatic dev-only choice, called out in-code as a TODO pointing back to this plan. See §12.

### 7.2 Buyer Dashboard

> **Status (updated 2026-09-16):** ✅ All 8 routes built and now wired to real Django/FastAPI endpoints — see §12 for exactly what each one calls and how it was verified. No route in this section is mock-data-driven anymore.

| Page | Route | Purpose | Status |
|---|---|---|---|
| Dashboard | `/buyer/dashboard` | Overview: active requirements, recent orders, price alerts | ✅ Real — stat tiles and recent-orders table computed from live `Requirement`/`Order`/`Listing` counts. |
| Catalog Browse | `/buyer/catalog` | Search/filter listings by vertical, grade, location, price | ✅ Real — client-side filter over `GET /api/catalog/listings/`, with real `grade`/`grade_confidence`/`seller_name`. |
| Listing Detail | `/buyer/catalog/[id]` | Full listing info, grading report, price breakdown, bid/buy CTA | ✅ Real — `ListingActions` (Buy Now/Place a Bid) both `POST /api/orders/bids/` for real. |
| My Requirements | `/buyer/requirements` | List/create/manage requirements | ✅ Real — `POST/GET /api/orders/requirements/`, including the new free-text `region` field. Posting now actually triggers the matching engine (`POST .../match/`, §12) instead of just persisting the row, with a "Check matches" re-trigger for requirements that don't match immediately. |
| Requirement Detail | `/buyer/requirements/[id]` | View matches, allocation proposals, accept/reject | ⬜ Not built |
| Orders | `/buyer/orders` | Order history, status tracking | ✅ Real — `GET /api/orders/orders/`, allocation rows show real denormalized commodity/unit/seller data. |
| Order Detail | `/buyer/orders/[id]` | Allocation breakdown, dispute option | ⬜ Not built (folded into the expandable `/buyer/orders` list instead) |
| Cost Estimator | `/buyer/estimate` | Input quantity + grade → estimated cost | ✅ Real — `GET /compute/pricing/{base,estimate,trends}`, grade/quantity multipliers actually apply. |
| Notifications | `/buyer/notifications` | In-app notification panel | ✅ Real — `GET /api/notifications/`, read/read-all persist via `POST`. |

### 7.3 Admin Console

> **Status (updated 2026-09-16):** ✅ All 7 routes built and wired to real endpoints — dashboard stats, verticals, users, verification queue, disputes, and pricing all read/write live Django/FastAPI data. See §12.

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/admin/dashboard` | Platform overview: total listings, orders, users, revenue — real, via `GET /api/auth/admin/stats/` |
| Vertical Config | `/admin/verticals` | List all verticals, edit schemas/pricing rules |
| Vertical Editor | `/admin/verticals/[id]` | JSONB schema editor for grading attributes + pricing rules |
| User Management | `/admin/users` | View/manage all users, role assignments |
| Verification Queue | `/admin/verification` | Review flagged listings (shared with Verifier) |
| Disputes | `/admin/disputes` | All disputes, resolution workflow — real, via `PATCH /api/disputes/{id}/` (Escalate/Mark resolved) |
| Price Management | `/admin/pricing` | Manual price entry (textiles), view ingested prices |

### 7.4 Verifier Console

> **Status (updated 2026-09-16):** ✅ All 3 routes built and wired to real endpoints. The dashboard's old "recent reviews"/"accuracy" stats were removed rather than wired, since `VerificationQueueView` has no reviewed-history data to back them (see §12) — showing a real, smaller dashboard beats showing a fake, fuller one.

| Page | Route | Purpose |
|---|---|---|
| Dashboard | `/verifier/dashboard` | Queue count, recent reviews, accuracy stats |
| Verification Queue | `/verifier/queue` | Flagged listings awaiting review |
| Review Page | `/verifier/queue/[id]` | Side-by-side: evidence (photos/docs) + AI grade + override form |

### 7.5 Application UI Components (shadcn/ui based)

> **Status:** 🟡 Mostly built, with one substitution. Table, Form (react-hook-form + zod), Sheet/Sidebar, Tabs, Dialog, Select, Switch, Field, and Command primitives are all built and used throughout. **Command palette (⌘K)** is real (§12) — `components/shared/command-palette.tsx`, mounted globally in `DashboardLayout`. **No charting library** was added — `components/shared/price-trend-chart.tsx` is a small hand-built inline-SVG line chart instead of Recharts/shadcn charts, used on the buyer estimator page.

- **DataTable** (sortable, filterable, paginated) for listings, orders, disputes — ✅ built as plain shadcn `Table` (sort/filter is client-side, not a generic reusable `DataTable` abstraction)
- **Form** (react-hook-form + zod validation) for all input forms — ✅ built, used in auth + every admin/buyer form
- **Sheet/Drawer** for mobile-friendly side panels — ✅ built (`components/ui/sheet.tsx`, powers the mobile sidebar)
- **Command** (⌘K style) for quick search across listings — ⬜ not built
- **Charts** (Recharts or shadcn charts) for price trends, analytics — 🟡 substituted with a custom inline-SVG chart (`price-trend-chart.tsx`) rather than a charting library

---

## 8. Seller Mobile App (Kotlin/Android)

> **Status:** ⬜ Not started. No `seller-app/` directory, no Kotlin/Android files anywhere in the repository. This entire section remains pure forward-looking spec — explicitly out of scope for now per standing instruction to skip app/ML work while the web dashboard was being built. The Django side is already prepared for it (`Listing.client_uuid` for idempotent offline sync, §4.3), so this section can be picked up without backend changes.

### 8.1 Architecture

- **MVVM** with Kotlin Coroutines + Flow
- **Room DB** for offline-first listing creation
- **WorkManager** for background sync when connectivity returns
- **Retrofit** for REST API calls to Django backend
- **Hilt** for dependency injection
- **FCM SDK** for push notifications

### 8.2 Screens

| Screen | Purpose |
|---|---|
| Login/Register | JWT auth, role = SELLER enforced |
| Dashboard | Active listings, pending grades, notifications, quick stats |
| Create Listing | Multi-step form: vertical → commodity → quantity → evidence upload → submit |
| My Listings | List with status filters (Draft, Pending, Active, Sold) |
| Listing Detail | Full info + grading results + bids received |
| Evidence Capture | Camera/gallery integration for photo/video upload |
| Bid Management | View incoming bids, accept/reject/counter |
| Notifications | Push notification history |
| Profile | Edit profile, language preference, FCM token management |

### 8.3 Offline-First Flow

1. Seller creates listing offline → saved to Room DB with status `DRAFT_LOCAL`
2. Evidence photos saved to local storage with listing reference
3. `WorkManager` periodic task checks connectivity
4. On reconnect: upload evidence files → create listing via API → mark synced
5. Conflict resolution: server timestamp wins, client gets updated record

### 8.4 Key Dependencies

```kotlin
// build.gradle.kts
dependencies {
    // Android core
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.0")
    
    // Room (offline DB)
    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    ksp("androidx.room:room-compiler:2.7.1")
    
    // WorkManager (background sync)
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    
    // Networking
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    // DI
    implementation("com.google.dagger:hilt-android:2.54")
    ksp("com.google.dagger:hilt-compiler:2.54")
    
    // FCM
    implementation("com.google.firebase:firebase-messaging-ktx:24.1.1")
    
    // Image loading
    implementation("io.coil-kt:coil:2.7.0")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.9.0")
}
```

---

## 9. ML Grading Pipeline

> **Status:** 🟡 ~30% complete. The OpenCV preprocessing stage (§9.4) is real, functional, and live — dynamically imported by the FastAPI grading service. Everything past preprocessing (§9.3 model training/inference) is unbuilt: `ml-training/scripts/train_classifier.py` is an explicit, never-run placeholder (its own docstring says so); `ml-training/data/` and `ml-training/notebooks/` are empty directories; no trained weights or checkpoints exist anywhere. `requirements-ml.txt` (torch/opencv/ultralytics) is declared but not installed in the FastAPI env. Grading currently falls back to a crude OpenCV edge-density heuristic proxy (`backend-fastapi/grading/pipeline.py`) instead of real MobileNetV3/YOLOv8n inference — see §5.1.

### 9.1 Architecture

```
Evidence Upload → Django (file storage) → FastAPI (grading trigger)
                                              ↓
                                    OpenCV preprocessing
                                              ↓
                                    MobileNetV3/YOLOv8n inference
                                              ↓
                                    Confidence score + attribute grades
                                              ↓
                              confidence ≥ 80%?  → grading_results (AI)
                              confidence < 80%?  → verification queue
```

### 9.2 Grading Attributes by Vertical

**Agriculture (wheat example):**
- `foreign_matter` — ML-gradeable (visual: detect foreign particles in grain photo)
- `moisture_content` — NOT ML-gradeable (needs instrument, manual entry)
- `grade_standard` — NOT ML-gradeable (needs certified assessment)

**Textiles (cotton fabric example):**
- `defect_rate` — ML-gradeable (visual: detect weaving defects, stains, holes)
- `gsm` — NOT ML-gradeable (needs weight measurement)
- `thread_count` — NOT ML-gradeable (needs lab analysis)

### 9.3 Model Selection

| Model | Params | Size | Inference (CPU) | Inference (GPU) | Use Case |
|---|---|---|---|---|---|
| MobileNetV3-Small | 2.5M | 10MB | ~15ms | ~3ms | Classification (grade prediction) |
| YOLOv8n | 3.2M | 6MB | ~30ms | ~5ms | Object detection (defect/foreign matter localization) |

**Training plan:**
1. Start with pretrained weights (ImageNet for MobileNetV3, COCO for YOLOv8n)
2. Use for general feature extraction initially — expect low accuracy, high verifier routing
3. As verifier-confirmed results accumulate (target: 200+ labeled images per class), fine-tune
4. Fine-tuning runs locally on RTX 3050 6GB — well within VRAM budget

### 9.4 OpenCV Preprocessing Pipeline

> **Status:** ✅ Implemented essentially as specified, in `ml-training/scripts/preprocess.py` — `extract_gabor_features()` (a real Gabor filter bank for texture) plus `preprocess_evidence()` matching the color histogram / texture / edge-density / resized-tensor shape below, with a CLI entry point. This is the module `backend-fastapi/grading/pipeline.py` dynamically imports at inference time — if the import fails (ML deps missing), grading falls back to a deterministic stub result instead (see §5.1).

```python
def preprocess_evidence(image_path: str) -> dict:
    img = cv2.imread(image_path)
    
    # 1. Color analysis (dominant colors, uniformity)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    color_histogram = cv2.calcHist([hsv], [0, 1], None, [180, 256], [0, 180, 0, 256])
    
    # 2. Texture analysis (Gabor filters for fabric, grain patterns)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gabor_features = extract_gabor_features(gray)
    
    # 3. Edge detection (defect boundaries)
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size
    
    # 4. Resize for model input
    resized = cv2.resize(img, (224, 224))
    normalized = resized / 255.0
    
    return {
        "tensor": normalized,
        "color_features": color_histogram,
        "texture_features": gabor_features,
        "edge_density": edge_density
    }
```

---

## 10. Integration, Testing & Polish

> **Status:** ⬜ Mostly not started. Only the auth flow is integrated end-to-end (frontend → Django JWT). Test coverage across the whole project is thin — see §10.2 for exact counts. No Vitest, Playwright, or ML test suite exists yet.

### 10.1 API Integration (Frontend ↔ Backend)

> **Status:** 🟡 Partial, and diverges from plan on JWT storage. `lib/api.ts` is built and generic (fetch-based, `djangoApi`/`fastApi` wrappers) but **only auth endpoints are wired through it** (`login`, `register`, `getCurrentUser`) — no listings/orders/verticals/pricing calls exist yet, despite the client being ready for them.

- **API client:** ✅ Built — `lib/api.ts`, fetch-based (not Axios), `djangoApi`/`fastApi` typed wrappers. Only auth calls actually go through it today.
- **JWT management:** 🟡 Diverges from plan. Tokens are stored in `localStorage` (`lib/auth.ts`), not "access token in memory, refresh token in httpOnly cookie" as originally planned — an explicit, in-code-documented dev-only tradeoff. Moving to an httpOnly refresh cookie is tracked in §12.
- **Error handling:** 🟡 Partial — `sonner` toasts are used ad hoc on individual pages for mock-action feedback; no global error boundary yet.
- **Loading states:** 🟡 Partial — `Skeleton` components are used for the auth-gating layout shells (buyer/admin/verifier layouts show a skeleton while checking the session), but not systematically across every data-fetching surface (most of which is still synchronous mock data, so there's nothing to load yet).

### 10.2 Testing Strategy

> **Status:** ⬜ Far below target across every layer. Actual counts as of this audit:

| Layer | Tool | Coverage Target | Actual |
|---|---|---|---|
| Django models/views | `pytest-django` | 80%+ on business logic (RBAC, allocation, grading) | ⚠️ 2 test methods total, `accounts` app only (register→login→/me/ flow, blocked admin self-registration). 7 of 8 apps have zero tests. |
| FastAPI endpoints | `pytest` + `httpx` | 80%+ on compute services | ⚠️ 5 test functions total, `matching/allocation.py` only. `grading`, `pricing`, `scheduler`, `main.py` have zero tests. |
| ML grading | Custom test suite | Accuracy metrics on holdout set | ⬜ None — no trained model to evaluate yet (§9). |
| React components | Vitest + React Testing Library | Key interactive flows | ⬜ Neither Vitest nor RTL is installed. |
| E2E flows | Playwright | Critical paths (listing creation → grading → matching → order) | ⬜ Not installed; no critical-path flow is fully wired end-to-end yet to test against. |
| API contract | OpenAPI schema validation | All endpoints | ⬜ Not set up. |

### 10.3 Performance Targets

- **Landing page:** LCP < 2.5s, FID < 100ms, CLS < 0.1
- **API response:** P95 < 200ms for catalog queries, < 500ms for grading trigger
- **ML inference:** < 100ms per image on GPU, < 500ms on CPU
- **Offline sync:** < 30s to sync 10 listings on reconnect

---

## 11. Azure Production Migration (Phase 7)

> **Status:** ⬜ Not started — correctly so. Local development is not yet complete end-to-end (§7, §9, §10), so this phase should stay untouched per its own gating note below.

> [!NOTE]
> This entire section is deferred until all local development is complete and working end-to-end. The $100 Azure student credit is not touched until this phase.

### 11.1 Migration Checklist

- [ ] Swap PostgreSQL Docker → Azure Database for PostgreSQL Flexible Server (Burstable B1MS)
- [ ] Swap local disk → Azure Blob Storage via `django-storages` (settings change only)
- [ ] Deploy Django + FastAPI to Azure Container Apps (Consumption plan)
- [ ] Write Bicep/Terraform IaC in `infra/`
- [ ] Validate ML model CPU inference latency in container
- [ ] Add deploy workflows to GitHub Actions
- [ ] Add Sentry for error tracking
- [ ] Configure custom domain + SSL
- [ ] Load testing with realistic data volumes

### 11.2 Cost Projection

| Resource | Tier | Est. Monthly |
|---|---|---|
| Azure DB for PostgreSQL | Burstable B1MS (free 12mo if eligible) | $0–15 |
| Azure Container Apps | Consumption plan | ~$0 |
| Azure Blob Storage | Standard LRS | ~$1–3 |
| **Total** | | **< $15/month** |

---

## 12. Pending Work — Prioritized

Consolidated from every ⚠️/🟡/⬜ marker above, grouped by area. File paths are relative to the repo root.

### Backend — Django
- [x] Wire the grading-trigger endpoint to actually call FastAPI (`catalog/views.py:68`, `POST /api/catalog/listings/{id}/grading/trigger/` → `POST /compute/grading/grade`). Verified end-to-end against a real running FastAPI + Postgres, plus `catalog/tests.py:GradingTriggerTest`.
  - [x] **Real bug found and fixed while writing a Playwright E2E test (§12 Testing):** the trigger view proxied FastAPI's response but never updated `Listing.status`, and FastAPI's `/compute/grading/grade` only ever writes a `GradingResult` row (deliberately — it has no reason to reach back into Django's `Listing` table, they're separate services/DBs-of-record). Net effect: **a listing that actually went through the real create → trigger-grading flow stayed `PENDING_GRADING` forever**, invisible to both the verification queue (`PENDING_VERIFICATION`) and buyers (`ACTIVE`), no matter how many times grading ran. Every prior verification-queue test/manual-verification session had only ever exercised listings whose status was set directly via Django shell/fixtures, which is why this never surfaced until something tried to drive the *actual* seller→grade→verify→buy pipeline end-to-end. Fixed: `trigger_grading` now sets `listing.status` from the response's `needs_verification` flag (`PENDING_VERIFICATION` if true, `ACTIVE` if false), guarded to only fire from `PENDING_GRADING` so re-grading an already-`ACTIVE`/`PENDING_VERIFICATION` listing can't silently revert it. 3 new tests (`catalog/tests.py:GradingTriggerTest`).
- [x] **Second real bug found the same way, in `orders/serializers.py:BidSerializer` — accepting a bid never created an `Order`.** `PATCH /api/orders/bids/{id}/ {"status": "ACCEPTED"}` was a pure status flip; nothing anywhere in the codebase ever called `Order.objects.create(...)` off a bid acceptance, so a buyer who successfully closed a deal would never see it on `/buyer/orders` — the transaction just silently evaporated. Found by extending the same Playwright lifecycle test to close the loop (buyer bids → seller accepts → buyer checks order history) rather than stopping at the bid. A second, more serious issue surfaced alongside it: `IsBidPartyOrAdmin` (core/permissions.py) grants both the buyer *and* the listing's seller object-level access to a bid, but doesn't distinguish which status transitions each party may make — meaning a **buyer could unilaterally accept their own bid**, no seller consent required. Fixed both in `BidSerializer`: `validate()` now rejects an ACCEPTED/REJECTED transition from anyone but the listing's seller or an admin (403, not silently allowed); `update()` now creates a real `Order` (buyer, `CONFIRMED`, `total_price = offered_price × offered_quantity`) and `OrderAllocation` (`CONFIRMED`, tied to the listing) on first acceptance, decrements `Listing.quantity` by the accepted amount, and marks the listing `SOLD` once exhausted — guarded so re-accepting an already-`ACCEPTED` bid can't double-book. 7 new tests (`orders/tests.py:BidViewSetTest`) cover the order/allocation creation, the quantity decrement, the full-quantity-sells-out-the-listing case, both the buyer-can't-accept and buyer-can't-reject permission denials, admin override, and the double-accept guard. Verified end-to-end in the Playwright lifecycle spec: after acceptance the listing is confirmed `SOLD` with `quantity: 0`, and the order is visible on the real `/buyer/orders` page with the correct commodity and quantity.
  - **Known, deliberately out-of-scope while fixing this:** the counter-bid workflow (`Bid.parent_bid`) still doesn't do anything beyond letting a new `Bid` row reference a parent — nothing marks the original `COUNTERED` or links the two in any UI. That's a separate, more involved feature (whose counter-offer is "the" active one, what happens to the original) and wasn't part of this bug, so it's left as its own future item rather than folded in here.
  - **Also noticed, also out of scope:** nothing in the codebase ever creates a `Notification` row automatically — not on order confirmation, not on dispute status changes, not on bid decisions. The whole notification pipeline (list, read, read-all, and even the FCM-dispatch signal right below this) is real and tested, but entirely passive: it only ever shows what's manually inserted. Wiring real trigger points (order confirmed, dispute updated, bid accepted/rejected) is a legitimate, contained follow-up — deliberately not bundled into this fix since it's a distinct, broader change (multiple trigger sites) rather than a one-line consequence of the bid-accept bug.
- [ ] Wire FCM dispatch to the Firebase Admin SDK (`notifications/signals.py:18,28`) — currently logs only. Not attempted this pass: needs a real Firebase project/service-account credentials this environment doesn't have, so it can't be verified end-to-end here the way everything else in this list was.
- [x] Write tests for the 7 untested apps — done for all of them (`catalog` was already covered from earlier work in this doc's history; `config`, `disputes`, `notifications`, `orders`, `pricing`, `reputation` are new). 72 Django tests total now (was 21). Found and fixed one real bug along the way: `core/permissions.py:IsOwnerOrAdmin.owner_fields` didn't include `against_id`, so the party a dispute was raised against could see it in their list (the queryset explicitly includes them) but got a 403 opening it individually — added `against_id` to `owner_fields`, with a regression test (`disputes/tests.py:test_against_party_can_retrieve`) that documents why.
- [x] **Wire real `Notification` trigger points.** Previously nothing in the codebase ever created a `Notification` row from an actual application event — the list/read/read-all endpoints and the FCM-dispatch signal were real and tested, but the pipeline was entirely passive. Five real trigger sites wired, each using an existing `NotificationType` (no schema change, and the frontend's `TYPE_ICON` map in `app/buyer/notifications/page.tsx` already covered all five, so no frontend changes were needed):
  - `BidSerializer.create` — notifies the listing's seller (`BID_RECEIVED`) when a buyer places a bid.
  - `BidSerializer.update` — notifies the buyer on both outcomes of the seller's decision: `ORDER_MATCHED` on acceptance (linked to the new `Order`), `SYSTEM` ("Bid rejected") on rejection. Both guarded against firing again on a no-op re-save (same pattern as the order-creation guard).
  - `DisputeSerializer.update` — notifies *both* `raised_by` and `against` (not just whoever made the request) on any status change, `DISPUTE_UPDATE`; does not fire when only `resolution_notes` changes without a status change.
  - `catalog/views.py:trigger_grading` — notifies the seller (`GRADING_COMPLETE`) when grading resolves a listing to `ACTIVE` or `PENDING_VERIFICATION`, with a message that differs by outcome.
  - `catalog/views.py:VerificationReviewView` — notifies the seller (`GRADING_COMPLETE`) on a verifier's approve/reject decision, including the verifier's notes on rejection. **This view had zero test coverage before this pass** despite being the actual verifier decision endpoint — added a full `VerificationReviewViewTest` class (6 tests: approve activates + records a `VERIFIER`-sourced `GradingResult`, reject sends back to `DRAFT`, both notification variants, 404 for a listing outside the queue, 403 for a non-verifier) alongside the new notification coverage.
  - 12 new tests total across `catalog/tests.py`, `orders/tests.py`, `disputes/tests.py` (102 Django tests now, was 90 before this bullet's work). Verified against live Postgres via real HTTP calls (not just the test suite): moved a real resolved dispute back to `UNDER_REVIEW` and rejected a real pending bid for the seeded demo accounts, confirmed both landed with the correct `type`/`title`/`message`/`related_object_*` for both parties, and confirmed the Playwright lifecycle spec (which exercises the accept path through the real browser UI) still passes with the new side effects in place.

### Backend — FastAPI
- [ ] Implement real Agmarknet ingestion in `ingest_agmarknet_prices` (`scheduler/jobs.py`) — currently a stub that only logs. Not attempted this pass: the actual Agmarknet API contract (endpoints, auth, response shape) isn't documented anywhere in this repo, and guessing at an external government API's interface risks shipping code that looks done but silently never works — a real integration needs someone to pull up the actual Agmarknet API docs first.
- [x] Resolve the `grade` derivation TODOs in `matching/router.py` and `pricing/router.py`. New `grading/grade.py:derive_grade()` — weighted-average of `GradingResult.attribute_scores` by `GradingSchema.attributes[].weight`, thresholded into "Grade A"/"Grade B"/"Grade C" (documented as a deliberate, swappable choice for a contract §3.1 never defined, not a final design). Also fixed a real pre-existing inconsistency: `matching/allocation.py`'s `DEFAULT_GRADE_ORDER` used bare `"A"/"B"/"C"` while `PricingRule.rules.grade_adjustment_table` and every frontend fixture used `"Grade A"` — standardized on the latter (dominant convention) and updated `tests/test_allocation.py`'s fixtures accordingly. Also caught and fixed a float-precision boundary bug (0.85×0.5+0.85×0.3 == 0.8499999999999999 in binary float, misclassifying an exact threshold). 9 new tests (`tests/test_grade.py`). `grading/lookup.py` holds the shared DB-lookup glue (schema attributes, latest grading result) used by `grading/`, `pricing/`, and `matching/` routers alike. `GradeResponse`/`GradingStatusResponse` (`grading/schemas.py`) also gained a `grade` field. Verified end-to-end against live Postgres: graded a listing, confirmed `/compute/grading/status`, `/compute/pricing/adjusted` (`grade_used: "Grade A"`, correct multiplier applied), and `/compute/matching/find` (a cheaper but lower-graded listing correctly lost to a pricier higher-graded one under a `min_grade` requirement) all agree.
  - [x] `matching/router.py`'s region TODO is resolved: real haversine-distance radius filtering. New `matching/allocation.py:haversine_km()` (pure, no external geocoding needed — it's just great-circle distance between two lat/lng pairs already on file) plus a `Requirement.search_radius_km` field (new Django migration `orders/0002_requirement_search_radius_km.py`, default 100km, mirrored in `db.py`) since `requirements` had no radius field at all before. `ListingOffer.region: str` → `location_lat`/`location_lng` floats; `greedy_allocate`'s `region` param → `center_lat`/`center_lng`/`radius_km` (geo filter only activates when all three are given; listings with no recorded location pass through rather than being excluded, matching this module's existing permissive-on-missing-data stance). 5 new tests. Verified against live Postgres: a cheaper-but-1400km-away listing (Chennai) correctly lost to a pricier-but-nearby one (Jaipur, ~0km) under a 100km-radius requirement; confirmed both listings are candidates again when the requirement has no region set at all (no-op preserved).
    - [ ] `pricing/router.py`'s region TODO (matching a `Listing` to a `price_points.region` free-text label) is a genuinely different problem — it needs reverse-geocoding or a bundled district-boundary dataset, neither of which this environment has access to (no Maps API key, no offline boundary data in the repo). Left open; flagging that unlike the matching fix above, this one can't be resolved with pure geometry.
- [x] Add test coverage for `grading/`, `pricing/`, and `scheduler/` modules. 17 new integration tests (`tests/test_grading_router.py`, `tests/test_pricing_router.py`, `tests/test_scheduler.py`) using a real `TestClient` + the live local Postgres — this codebase has no separate test-database convention the way Django's `manage.py test` does, so these write directly to the dev DB with clearly-prefixed (`pytest-fastapi.test` / `Pytest ...`) fixture rows cleaned up per test (see `conftest.py`/`tests/db_fixtures.py` docstrings for the isolation tradeoff and cleanup-sweep guidance if a run ever crashes mid-test). Writing these surfaced and fixed a real, separate class of bug along the way: `db.py`'s SQLAlchemy models had drifted from the actual Postgres schema on ~10 columns (`Listing.client_uuid` was missing from the mapping entirely; `Listing.sub_category`, `GradingResult.notes`, `Requirement.min_grade`, `OrderAllocation.status`, `ReputationScore`'s three score fields, `GradingSchema.attributes`, `PricingRule.rules` were all marked `nullable=True`/no-default when the real columns are `NOT NULL` with no DB-side default — Django enforces those defaults at the ORM layer only). None of this had broken anything yet because nothing FastAPI-side had ever tried to `INSERT` through the affected models before these tests did — now fixed with matching Python-side defaults, verified by every new test actually writing rows through the real mappings. FastAPI test count: 36 (was 14).
- [x] **Wire up `POST /compute/matching/allocate` — nothing in the whole codebase ever called it.** Auditing for "what else in FastAPI is genuinely unfinished" turned up that the entire requirement-based matching engine was built, tested at the pure-function level (`matching/allocation.py`), exposed as a real HTTP endpoint — and never once invoked, by anything. Django had no code path that called it; the buyer requirements page's own copy ("Post a requirement — the matching engine finds sellers for you") was aspirational text. A buyer posting a requirement just... posted a requirement, forever `OPEN`, with nothing ever checking it against the catalog. Three real fixes, found in the course of wiring this up for real:
  1. **The router itself had zero integration tests** (`matching/allocation.py`'s pure function did, but never the actual `/compute/matching/{find,allocate}` HTTP endpoints) — added `tests/test_matching_router.py`, 8 tests covering a dry-run `/find` (no persistence), a full-fulfillment `/allocate`, a partial one (`shortfall` reported, requirement stays `OPEN` rather than `MATCHED`), the 409-no-match and 404-unknown-requirement cases, and `min_grade` filtering end-to-end.
  2. **`/allocate` created `Order`/`OrderAllocation` rows without ever touching the `Listing`s it allocated from** — `Listing.quantity` never decremented and `status` never flipped to `SOLD`, so the exact same stock could be "matched" again by a later requirement indefinitely, and a listing could never sell out through this path no matter how much of it got allocated. This is the same class of bug as the bid-accept fix above; fixed the same way (decrement, mark `SOLD` on exhaustion), verified by the new tests.
  3. Django side: new `POST /api/orders/requirements/{id}/match/` (`orders/views.py:RequirementViewSet.trigger_match`), proxying to FastAPI exactly like `catalog/views.py:trigger_grading` proxies grading — "no match yet" is a normal 200 (`matched: false`), not an error, since most requirements won't match the instant they're posted. On a real match, notifies the buyer (`ORDER_MATCHED`, wording differs for full vs. partial fulfillment) using the notification pipeline wired earlier this pass. 5 new Django tests (`orders/tests.py:RequirementMatchActionTest`), including a real one: `IsOwnerOrAdmin`'s object-level check means a seller who can *list* an `OPEN` requirement (as a demand signal) still can't retrieve or act on its detail — confirmed as a real, acceptable behavior (nothing in the detail response isn't already in the list response), not a bug to fix.
  - Frontend: `components/buyer/post-requirement-dialog.tsx`'s `onCreate` now fires the match trigger immediately after a requirement posts (silently — "no match yet" isn't worth interrupting the buyer for), and `app/buyer/requirements/page.tsx` gained a "Check matches" button on `OPEN` rows for re-checking later once new listings appear. New Playwright spec `e2e/requirement-matching.spec.ts` drives the whole thing through the real UI (post a requirement for an already-verified, already-active listing → toast confirms a real match → order → notification).
  - **That new Playwright spec caught a fourth real bug on its first run**, this one in `VerificationReviewView` (§12, "Verification queue" bullet above): clicking "Confirm AI Grade" (`components/verifier/review-panel.tsx`, the no-override path) sends no `attribute_scores` in the request — the view defaulted that to `{}`, creating a new `GradingResult` that silently blanked out the listing's grade data the moment a verifier confirmed it, even though the listing's `status` correctly went `ACTIVE`. Anything deriving a grade from `attribute_scores` (matching's `min_grade` filter, pricing's grade-adjustment multiplier) would then treat a confirmed, AI-graded listing as ungraded — exactly what made the first version of the Playwright spec fail with a real "no match" even though every filter condition was actually satisfied. Fixed: a missing/empty `attribute_scores` in the request now carries forward the listing's latest existing result instead of defaulting to empty; an explicit override (partial or full) still takes precedence, untouched. 2 new tests (`catalog/tests.py:VerificationReviewViewTest`).
  - Django test count: 109 (was 90). FastAPI test count: 44 (was 36). Playwright: 6 specs (was 5), run twice back-to-back to confirm no flakiness.

### Frontend
- [x] `app/admin/pricing/page.tsx` — wired end-to-end: verticals and price points now load from `GET /api/config/verticals/` and `GET /api/pricing/price-points/` (both DRF-paginated — see `Paginated<T>` in `lib/api.ts`), "Add price point" persists via `POST /api/pricing/price-points/`. The vertical filter tabs and the add-dialog's vertical picker are now driven by real verticals instead of a hardcoded agriculture/textiles pair. `PricePoint` has no `unit` field on the Django side (unit is implied by the vertical's `unit_of_measure`) — the form's unit input is preserved in `raw_data.unit` rather than dropped or forced into the model. Verified with a real browser session against live Django/FastAPI/Postgres (login → add a price point → reload → still there), not just a mocked test.
- [x] `components/admin/vertical-editor.tsx` (+ `app/admin/verticals/page.tsx` and `app/admin/verticals/[id]/page.tsx`) — wired end-to-end via `PUT /api/config/verticals/{id}/grading-schema/` and `PUT /api/config/verticals/{id}/pricing-rules/` (not a plain `PATCH /verticals/{id}/`, which only touches name/slug/unit_of_measure/is_active). One real mismatch found and handled: `PricingRule.rules` has a live reader — `backend-fastapi/pricing/service.py` — that expects `{grade_adjustment_table: [{grade, multiplier}], quantity_tier_table: [{min_quantity, multiplier}]}`, not the editor's percentage-based UI shape (`adjustment_pct`/`discount_pct`). Added a bidirectional multiplier↔percentage converter in the component rather than changing the UI or the FastAPI contract. `GradingSchema.attributes` has no such live shape constraint (only `name`/`gradeable_by_ml` are read, by `grading/router.py:_ml_attribute_names`), so it's persisted as-is. Verified deeply: edited a grade adjustment in the browser (4%→5%), confirmed Postgres stored `multiplier: 1.05`, then confirmed `GET /compute/pricing/estimate` on FastAPI actually priced a listing using it (`2000 × 1.05 × 0.985 = 2068.5`) — full stack, not just the UI layer.
- [x] `app/admin/users/page.tsx` — wired end-to-end. This one was genuinely blocked (no admin user-list/detail endpoint existed), so it needed a small backend addition, not just frontend wiring: `accounts/views.py:AdminUserViewSet` (list + `is_active`-only partial update, `IsAdmin`-gated, `http_method_names` restricted to get/patch so it can't be used for user creation/deletion or email/role edits) + `AdminUserSerializer` (email/phone/role/created_at/profile read-only) + registered in `accounts/urls.py`. Real mount point is `GET/PATCH /api/auth/users/{id}/` — `accounts` is mounted at `/api/auth/` in `core/urls.py`, not `/api/accounts/` as this doc originally assumed (there is no `/api/accounts/` prefix anywhere). 4 new backend tests (`accounts/tests.py:AdminUserManagementTest`) cover list, 403-for-non-admin, the toggle, and that role can't be changed through this endpoint. Verified in a real browser: toggled a seller's account off, confirmed `is_active=False` in Postgres directly.
- [x] Verification queue — `app/verifier/queue/page.tsx`, `app/verifier/queue/[id]/page.tsx`, `app/admin/verification/page.tsx`, `components/verifier/review-panel.tsx`, `components/verification/review-dialog.tsx` all wired end-to-end. This needed a real backend addition, not just frontend plumbing: `VerificationQueueView` (`catalog/views.py`) returned a bare `ListingSerializer` before — it now returns an enriched per-listing shape (`ai_grade`/`ai_confidence` via a new `catalog/grading.py:derive_grade`, deliberately mirroring `backend-fastapi/grading/grade.py` rather than importing it — they're separate deployments — `priority` and `flagged_reason` derived from how far below `CONFIDENCE_VERIFICATION_THRESHOLD` (0.80) the confidence falls, `evidence_image_count`, `seller_name` with an email fallback when no `UserProfile` exists). 15 new Django tests (`catalog/tests.py:DeriveGradeTest`, `VerificationQueueTest`) cover the derivation, priority thresholds, the no-grading-result and no-profile edge cases, and the permission check. No detail endpoint exists for a single queue item, so `[id]/page.tsx` fetches the full queue and finds by `listing_id` — documented as the real contract, not a shortcut. `ReviewDialog`'s `onResolve` now does the actual `POST` and only reports success back to the parent (which then drops the item locally) — a real bug caught and fixed along the way: the dialog was closing itself unconditionally after calling `onResolve`, which would have closed it even on a failed submit. Verified end-to-end in a real browser as both roles: verifier confirmed a Grade-C listing (62% confidence, correctly bucketed `MEDIUM`) → listing flipped to `ACTIVE` in Postgres with a new `VERIFIER`-sourced `GradingResult`; admin rejected a separate listing with notes → listing flipped to `DRAFT`, notes persisted verbatim, item vanished from both queues.
- [x] Wire the remaining mock-data call sites (listings, requirements, orders, notifications, disputes, admin dashboard stats, verifier dashboard) to real `djangoApi`/`fastApi` calls. Needed three small, targeted backend additions, all driven by what the frontend actually needed to render (not speculative):
  - `catalog/serializers.py:ListingSerializer` gained `grade`/`grade_confidence`/`seller_name` (`SerializerMethodField`s reusing `catalog/grading.py:derive_grade`, same pattern as `VerificationQueueView`, with the derived grade cached per-instance so `get_grade`/`get_grade_confidence` don't each re-query). The `_seller_display_name` helper (used by `VerificationQueueView`) was renamed to `_display_name` and hoisted into `catalog/serializers.py` so `orders/serializers.py` and `disputes/serializers.py` could reuse it too, instead of three copies drifting.
  - `orders/models.py:Requirement` gained a free-text `region` CharField (migration `0003_requirement_region`) — deliberately independent of `region_lat`/`region_lng` (which drive matching's geo-radius filter and need real coordinates, not a place name); mirrored on the FastAPI side in `db.py` with the same `default="", nullable=False` pattern already used for the other drift-prone columns, to avoid reintroducing the class of bug found last pass. `orders/serializers.py:OrderAllocationSerializer` also gained denormalized `commodity_name`/`unit`/`seller_name` (with `OrderViewSet.get_queryset` now `prefetch_related`ing `allocations__listing__seller__profile`) so the order-history UI doesn't need a separate per-listing fetch.
  - `disputes/serializers.py:DisputeSerializer` gained denormalized `raised_by_name`/`against_name`. Along the way, fixed a real frontend/backend mismatch: the admin disputes UI's mock data used a `REJECTED` dispute status that was never a real `Dispute.Status` choice (real choices are `OPEN`/`UNDER_REVIEW`/`RESOLVED`/`ESCALATED`) — the "Reject dispute" button is now "Escalate", matching the actual model.
  - New `accounts/views.py:AdminStatsView` (`GET /api/auth/admin/stats/`, admin-only) for the admin dashboard's platform-wide counters — real counts (`total_listings`/`total_orders`/`total_users`) plus a genuine month-over-month `revenue_delta_pct` computed from `Order.total_price` for `CONFIRMED`/`FULFILLED` orders (`None`, not `0`, when last month had no revenue to compare against — an undefined percentage isn't zero).
  - Frontend: `lib/api.ts` gained `Listing`/`Requirement`/`Order`/`Bid`/`Notification`/`Dispute`/`PlatformStats` types and their CRUD helpers. Rewrote as real data: `app/buyer/{dashboard,catalog,catalog/[id],requirements,orders,notifications}/page.tsx`, `components/buyer/{listing-actions,post-requirement-dialog}.tsx`, `app/admin/{dashboard,disputes}/page.tsx`, `app/verifier/dashboard/page.tsx`. The verifier dashboard's old "recent reviews"/"accuracy" stats were **removed rather than wired**, since `VerificationQueueView` only ever returns pending items — there's no real reviewed-history endpoint to back that UI, and faking it would've been worse than not showing it (documented in the component, not silently dropped).
  - Verified end-to-end in a real browser against live Postgres, not just type-checked: seeded a buyer/seller/admin/verifier plus two listings (one AI-graded to Grade A) and an order/notification/dispute directly in the dev DB, then as buyer confirmed the catalog card/detail page render the real grade and price breakdown, placed both a Buy-Now bid (full qty at asking price) and a custom Place-a-Bid offer (both landed as real `Bid` rows), posted a requirement with a free-text region (persisted and displayed with the vertical's real unit), expanded an order to see the real denormalized allocation, and marked a notification read (persisted). As admin, confirmed the dashboard's stats/verification-queue/open-disputes panels all matched real DB state, then resolved the seeded dispute (`status` → `RESOLVED`, `resolved_at` set, notes persisted). As verifier, confirmed the dashboard's queue count/list matched the (empty) real queue with no fabricated reviewed-history numbers. `app/buyer/estimate` (cost estimator) was **not** touched this pass — it still uses hardcoded `BASE_PRICES`/`GRADE_MULTIPLIER` objects rather than FastAPI's real `/compute/pricing/*` endpoints; left open below.
- [x] `app/buyer/estimate/page.tsx` — wired end-to-end to real `GET /compute/pricing/{base,estimate,trends}` (no Django auth needed, these are public FastAPI compute endpoints; `lib/api.ts` gained `getBasePrice`/`getPriceEstimate`/`getPriceTrends`). Vertical picker now loads real verticals (`listVerticals`) instead of a hardcoded agriculture/textiles pair; commodity is now free text instead of a fixed 4-item list, since there's no commodity master list anywhere in the system. The old free-text "region" field was dropped rather than wired — `pricing/router.py`'s own code comment already documents that there's no real join between a listing's lat/lng and a price point's free-text region label, so a region input that silently 404s or is silently ignored would be worse than not having it. A 404 from either endpoint (no price data at all for that vertical/commodity) now renders an honest "no price data yet — an admin needs to add one" empty state instead of falling back to fabricated numbers. This was also the last consumer of `lib/mock-data.ts` (via `mockPriceTrend`) — the file was entirely dead code afterward and has been deleted. Verified end-to-end in a real browser against live Postgres: seeded 5 real `PricePoint` rows for Wheat trending 2400→2460, confirmed the "Any grade" / low-quantity case returns the flat base price (₹2,460 × 20 = ₹49,200) and the Grade A / 100-quantity case correctly compounds *both* real `PricingRule` multipliers (quantity-tier 0.985 × grade 1.05 → ₹2,544.26/unit × 100 = ₹2,54,426, matching hand-calculated arithmetic exactly), the real 30-day trend chart renders the 5 seeded points, and an unknown commodity renders the empty state rather than a crash or fake number.
- [x] Add a Vitest + React Testing Library setup and a Playwright E2E setup (§10.2).
  - **Vitest** (`vitest.config.ts`, jsdom environment, `@/*` alias matching `tsconfig.json`): 26 tests across `lib/api.test.ts` (the `djangoApi`/`fastApi` request wrapper — auth headers, JSON body serialization, `ApiError` status/message on non-ok responses including both the empty-body and body-read-throws fallback paths, 204 handling), `lib/auth.test.ts` (session round-trip through `localStorage`, the `msme-auth-change` event other components listen for, survives corrupted JSON, `dashboardPathForRole` per role), and `components/shared/status-badge.test.tsx` (label formatting, color-per-status including the `RESOLVED`/`ESCALATED`/`UNDER_REVIEW` statuses added this pass, graceful fallback for an unrecognized status).
  - **Playwright** (`playwright.config.ts`, Chromium only, targets the real local dev stack — no mocked backend, same "verify against real services" convention as the Django/FastAPI suites). `e2e/helpers.ts` registers fresh users with randomized emails per run directly against the real Django API (fast, and makes re-runs collision-free) and logs into the real UI form at least once per flow. Two specs:
    - `e2e/auth.spec.ts` (4 tests) — registration through the real form, API-registered-user login through the real form, protected-route redirect when unauthenticated, and a real wrong-password 401 rendering the right error text.
    - `e2e/marketplace-lifecycle.spec.ts` (1 test, the flagship) — seller creates and grades a listing via the real API (there's no seller-facing web UI yet, that's the deferred Android app, so this is what a seller app would call), a verifier approves it through the real `/verifier/queue/[id]` UI, and a buyer finds it in the real `/buyer/catalog` UI and places a Buy Now bid — asserting against the real database at every hand-off (listing status after grading, after review, and the persisted `Bid` row).
    - **This test caught a real, previously-undiscovered bug on its first run**, documented in full under Backend — Django above: grading never actually advanced `Listing.status`, so no listing that went through the real create → grade flow could ever reach the verification queue or the buyer catalog. Every earlier round of manual verification in this project had only ever exercised listings whose status was set directly via Django shell — this is exactly the class of bug that only an end-to-end test driving the *actual* multi-role pipeline will surface, and exactly why this item was worth doing even this late.
  - `package.json` gained `test` / `test:watch` / `test:ui` / `test:e2e` scripts. Both suites verified green on repeated runs (Playwright run twice back-to-back to rule out flakiness from parallel workers using shared dev-DB state).
- [x] Command palette (⌘K) (§7.5). `components/ui/command.tsx` — the standard shadcn `Command`/`CommandDialog` primitives, hand-written against the already-installed `cmdk` package rather than run through the `shadcn` CLI (its `add` command wanted to overwrite existing components interactively, which isn't safe to answer blind — declined, and removed the one stray unrelated `cn` package it had already added before aborting). `components/shared/command-palette.tsx` mounts once in `DashboardLayout` (shared by all three role shells), listens globally for Ctrl/Cmd+K, and lists the current role's real `navItems` plus a "Log out" action — no hardcoded per-role duplication. New Playwright spec `e2e/command-palette.spec.ts` (3 tests: open+navigate, toggle-closes, log-out-clears-session-for-real) drives it through actual keyboard input, not a click shortcut.
  - **Writing that spec caught a fifth real bug, more serious than the others**: logging in as a **SELLER** through the real UI hung on an infinite loading skeleton forever. `app/buyer/layout.tsx` only accepted `user.role === "BUYER"`; anyone else got `router.replace(dashboardPathForRole(user.role))` — but `dashboardPathForRole("SELLER")` returns `/buyer/dashboard` (by design: "sellers share the buyer console shell", there's no separate seller web UI). That's a redirect to the exact URL already loaded, so the effect fires, does nothing observable, and the role check never passes — the skeleton never resolves. This is a **pre-existing bug, not something introduced this pass** — nothing in this project's own test suite had ever logged in as a SELLER through the actual browser UI before (`e2e/marketplace-lifecycle.spec.ts` only uses a seller's token via the API for setup, never drives their UI login), so it had never been caught. Fixed: `app/buyer/layout.tsx` now accepts both `BUYER` and `SELLER` (`ADMIN`/`VERIFIER` layouts were checked too — both are single-role with no aliasing in `dashboardPathForRole`, so they were never at risk of this).
- [ ] `next-i18next` (Hindi/English) — not yet installed; part of the deferred Phase F7 polish (§6.7). Deliberately not attempted this pass — real i18n means translating copy across ~20 pages, which deserves its own dedicated pass rather than a rushed partial pass alongside everything else here.
- [x] `/forgot-password` page (§7.1), plus `/reset-password` (not separately tracked before, but required to make the former actually work). Real backend, not a stub: `accounts/views.py:PasswordResetRequestView`/`PasswordResetConfirmView` using Django's own `default_token_generator` (the same primitive the stock HTML `PasswordResetView` uses) exposed as a JSON API, with real enumeration protection (always 200, identical response, whether or not the email exists). No SMTP credentials exist in this environment, so `EMAIL_BACKEND` defaults to Django's console backend (env-overridable for a real deployment) — a real, standard Django dev pattern, not a fake shortcut: the actual `send_mail()` code path runs, it just writes to stdout instead of an SMTP server. New settings: `FRONTEND_URL` (for building the reset link, mirroring the existing `FASTAPI_BASE_URL` pattern), `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL`. 6 new Django tests (`accounts/tests.py:PasswordResetTest`) cover the real email being sent with a working link, enumeration protection, a valid token actually changing the password (and then logging in with it), an invalid token being rejected without a 500, a garbage (non-base64) uid being rejected cleanly, and Django's built-in token-reuse protection (the token generator hashes in the password, so it auto-invalidates once used — confirmed for real, not assumed). Frontend: `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx` (reads `?uid=&token=` from the query string; shows a real "Invalid reset link" state rather than a broken form when they're missing), a "Forgot password?" link added to the login page. New Playwright spec `e2e/password-reset.spec.ts` (5 tests) drives the real request flow against the real backend end-to-end, and the confirm page's real error handling for a bad/forged token — deliberately not scraping the dev-server log for a real token to test the happy confirm path, since that log path isn't a stable enough convention across environments for a committed spec to depend on (the Django-side test suite already covers the real token lifecycle exhaustively). Verified once more directly via `curl` outside the test suite too: a real email materialized in the console log with a working link, confirming with the real extracted uid/token changed the password, and logging in with the new password succeeded.
- [ ] Move session storage off `localStorage` to an httpOnly refresh cookie issued by Django (per §10.1's original design intent). Not attempted this pass — more architecturally invasive than the above (needs a new Django cookie-issuing/refresh endpoint, CSRF handling, and touches every authenticated fetch call in the frontend), and didn't want to rush it alongside everything else here.

### ML Pipeline
- [ ] Collect a labeled dataset (target 200+ images/class/vertical per §9.3) under `ml-training/data/<vertical>/<attribute>/<class>/`.
- [ ] Run `ml-training/scripts/train_classifier.py` once data exists — code-complete but never executed.
- [ ] Install `requirements-ml.txt` (torch/opencv/ultralytics) in the FastAPI environment.
- [ ] Swap the OpenCV edge-density heuristic in `backend-fastapi/grading/pipeline.py` for real MobileNetV3-Small / YOLOv8n inference once trained weights exist.

### Seller Mobile App
- [ ] Entire Kotlin/Android app (§8) — not started. Scaffold when this phase is greenlit; the Django-side prerequisite (`Listing.client_uuid` for idempotent offline sync) is already in place.

### Testing / Polish
- [ ] Full §10.2 test-layer buildout across all five layers (Django, FastAPI, ML, React, E2E).
- [ ] Validate against §10.3 performance targets once there's real traffic/data to measure against.
- [ ] Add an OpenAPI schema validation step to CI once more endpoints are frontend-wired.

---

## Open Questions for User Review

> [!IMPORTANT]
> **Color palette:** The plan uses emerald/green (`#10B981`) as the primary accent, replacing the template's gold/amber. Is this the right branding direction? Alternatives: blue (trust), orange (energy/trade), teal (modern/fresh).

> [!IMPORTANT]
> **Brand name:** The plan uses "MSME Marketplace" as a working name. Do you have a preferred brand name? This affects the logo, hero text, and all marketing copy.

> [!IMPORTANT]
> **Pricing tiers (Section 6.5):** The pricing page shows 3 tiers (Starter/Growth/Enterprise). Are these relevant for your project, or should this be adapted? (The original project doc doesn't mention marketplace monetization.)

> [!WARNING]
> **Disk space:** Your system has ~34GB free on a 121GB drive. Docker images (PostgreSQL ~400MB, PostGIS ~800MB), node_modules (~300MB), Python venvs (~2GB with PyTorch), and Android SDK (~5–10GB) will consume significant space. You may want to free up space or use an external drive.

> [!NOTE]
> **Frontend template screenshots:** Only 4 screenshots were provided. The browser MCP and URL scraping have captured the full homepage structure. For sub-pages (`/work`, `/products`, `/pricing`, `/blog`), I'll use browser MCP during implementation to verify exact layouts.
