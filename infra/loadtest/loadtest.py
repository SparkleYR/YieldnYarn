"""Latency check against implementation_plan.md §10.3 API targets.

    P95 < 200 ms for catalog queries, < 500 ms for the grading trigger.

Registers a throwaway seller and buyer, seeds listings through the public API,
then hammers each endpoint with --concurrency parallel clients and reports
p50/p95/p99. Point it at any deployment (docker compose, Azure):

    pip install httpx
    python infra/loadtest/loadtest.py --api http://localhost:8000/api \\
        --compute http://localhost:8001/compute --requests 300 --concurrency 10

Only creates rows owned by the two throwaway accounts it registers; the
grading trigger runs against those listings only.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
import uuid

import httpx

TARGETS_MS = {"catalog": 200, "grading": 500}


def percentile(values: list[float], pct: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(pct / 100 * len(ordered)) - 1))
    return ordered[index]


async def register_and_login(client: httpx.AsyncClient, api: str, role: str) -> str:
    email = f"loadtest-{role.lower()}-{uuid.uuid4().hex[:8]}@example.com"
    password = f"Lt-{uuid.uuid4().hex}"
    phone = str(9_000_000_000 + uuid.uuid4().int % 999_999_999)
    r = await client.post(f"{api}/auth/register/", json={"email": email, "password": password, "role": role, "phone": phone})
    r.raise_for_status()
    r = await client.post(f"{api}/auth/login/", json={"email": email, "password": password})
    r.raise_for_status()
    return r.json()["access"]


async def run_endpoint(name, make_request, total: int, concurrency: int) -> dict:
    latencies: list[float] = []
    errors = 0
    queue = asyncio.Queue()
    for i in range(total):
        queue.put_nowait(i)

    async def worker():
        nonlocal errors
        while not queue.empty():
            i = queue.get_nowait()
            started = time.perf_counter()
            try:
                response = await make_request(i)
                if response.status_code >= 400:
                    errors += 1
            except httpx.HTTPError:
                errors += 1
            latencies.append((time.perf_counter() - started) * 1000)

    started = time.perf_counter()
    await asyncio.gather(*(worker() for _ in range(concurrency)))
    elapsed = time.perf_counter() - started
    return {
        "endpoint": name,
        "requests": total,
        "errors": errors,
        "rps": round(total / elapsed, 1),
        "p50_ms": round(statistics.median(latencies), 1),
        "p95_ms": round(percentile(latencies, 95), 1),
        "p99_ms": round(percentile(latencies, 99), 1),
    }


async def main(args: argparse.Namespace) -> list[dict]:
    api, compute = args.api.rstrip("/"), args.compute.rstrip("/")
    limits = httpx.Limits(max_connections=args.concurrency * 2)
    async with httpx.AsyncClient(timeout=30, limits=limits) as client:
        seller = {"Authorization": f"Bearer {await register_and_login(client, api, 'SELLER')}"}
        buyer = {"Authorization": f"Bearer {await register_and_login(client, api, 'BUYER')}"}
        verticals = (await client.get(f"{api}/config/verticals/", headers=buyer)).json()
        verticals = verticals.get("results", verticals) if isinstance(verticals, dict) else verticals
        vertical = next(v for v in verticals if v["slug"] == args.vertical)

        listing_ids = []
        for i in range(args.seed_listings):
            r = await client.post(
                f"{api}/catalog/listings/",
                headers=seller,
                json={
                    "vertical": vertical["id"],
                    "commodity_name": ["Wheat", "Rice", "Maize", "Soybean"][i % 4],
                    "quantity": 10 + i,
                    "unit": vertical["unit_of_measure"],
                    "price_suggested": 2200 + i,
                    "region": "Maharashtra",
                },
            )
            r.raise_for_status()
            listing_ids.append(r.json()["id"])
        print(f"Seeded {len(listing_ids)} listings in vertical {args.vertical!r}")

        n, c = args.requests, args.concurrency
        results = [
            await run_endpoint(
                "catalog list (seller, page 1)",
                lambda i: client.get(f"{api}/catalog/listings/", headers=seller),
                n,
                c,
            ),
            await run_endpoint(
                "catalog search + filter",
                lambda i: client.get(
                    f"{api}/catalog/listings/",
                    headers=seller,
                    params={"search": ["whe", "rice", "maize", "soy"][i % 4], "vertical": vertical["id"]},
                ),
                n,
                c,
            ),
            await run_endpoint(
                "catalog list (buyer, ACTIVE only)",
                lambda i: client.get(f"{api}/catalog/listings/", headers=buyer),
                n,
                c,
            ),
            await run_endpoint(
                "listing detail",
                lambda i: client.get(f"{api}/catalog/listings/{listing_ids[i % len(listing_ids)]}/", headers=seller),
                n,
                c,
            ),
            await run_endpoint(
                "grading trigger (Django -> FastAPI -> DB)",
                lambda i: client.post(
                    f"{api}/catalog/listings/{listing_ids[i % len(listing_ids)]}/grading/trigger/", headers=seller
                ),
                min(n, len(listing_ids) * 3),
                c,
            ),
            await run_endpoint(
                "compute health",
                lambda i: client.get(compute.rsplit("/compute", 1)[0] + "/health"),
                n,
                c,
            ),
        ]
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", default="http://localhost:8000/api")
    parser.add_argument("--compute", default="http://localhost:8001/compute")
    parser.add_argument("--vertical", default="agriculture")
    parser.add_argument("--seed-listings", type=int, default=60)
    parser.add_argument("--requests", type=int, default=300, help="Requests per endpoint")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--json", help="Also write the results here")
    args = parser.parse_args()

    results = asyncio.run(main(args))
    print(f"\n{'endpoint':44} {'req':>5} {'err':>4} {'rps':>7} {'p50':>7} {'p95':>7} {'p99':>7}")
    for row in results:
        print(
            f"{row['endpoint']:44} {row['requests']:>5} {row['errors']:>4} {row['rps']:>7} "
            f"{row['p50_ms']:>7} {row['p95_ms']:>7} {row['p99_ms']:>7}"
        )
    print(f"\nTargets: catalog P95 < {TARGETS_MS['catalog']} ms, grading trigger P95 < {TARGETS_MS['grading']} ms")
    if args.json:
        with open(args.json, "w") as fh:
            json.dump(results, fh, indent=2)
