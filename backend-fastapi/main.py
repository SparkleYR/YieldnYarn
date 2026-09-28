"""FastAPI compute/ML service entrypoint (implementation_plan.md §5).

Run locally with:
    uvicorn main:app --reload --port 8001
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from grading.router import router as grading_router
from matching.router import router as matching_router
from pricing.router import router as pricing_router
from scheduler.jobs import expire_stale_listings, ingest_agmarknet_prices

from db import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("msme-fastapi")

if settings.SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.1, send_default_pii=False)

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # §5.4 APScheduler jobs
    scheduler.add_job(
        ingest_agmarknet_prices,
        "interval",
        hours=6,
        id="ingest_agmarknet_prices",
        replace_existing=True,
    )
    scheduler.add_job(
        expire_stale_listings,
        "cron",
        hour=2,
        minute=0,
        id="expire_stale_listings",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler started: ingest_agmarknet_prices (every 6h), expire_stale_listings (daily 02:00)")
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


app = FastAPI(
    title="MSME Multi-Vertical Commodity Marketplace — Compute/ML Service",
    description="FastAPI service for grading, pricing, and matching compute workloads. See implementation_plan.md §5.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(grading_router)
app.include_router(pricing_router)
app.include_router(matching_router)


@app.get("/health")
def health() -> dict:
    """Basic liveness check — does not touch the database."""
    return {"status": "ok"}
