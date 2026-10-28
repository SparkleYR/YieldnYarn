"""Read-only readiness check for the running laptop demo (apart from logging in)."""
import json
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[2]
API = "http://127.0.0.1:8000/api"
COMPUTE = "http://127.0.0.1:8001/compute"
results = []


def check(label, callback):
    try:
        detail = callback()
        results.append({"check": label, "passed": True, "detail": detail})
        print(f"PASS {label}: {detail}")
    except Exception as error:
        results.append({"check": label, "passed": False, "detail": str(error)})
        print(f"FAIL {label}: {error}")


def get(url, headers=None, params=None):
    response = client.get(url, headers=headers, params=params)
    response.raise_for_status()
    return response.json()


def collection(path, headers):
    data = get(API + path, headers)
    items = data.get("results", []) if isinstance(data, dict) else data
    assert items, "No demonstration data"
    return data.get("count", len(items)) if isinstance(data, dict) else len(items)


with httpx.Client(timeout=30, follow_redirects=True) as client:
    def web():
        response = client.get("http://localhost:3000")
        response.raise_for_status()
        assert "Yield" in response.text or "yield" in response.text
        return response.status_code
    check("Web page", web)
    check("Compute service", lambda: get("http://127.0.0.1:8001/health"))
    sessions = {}
    for handle in ("buyer", "farmer", "weaver", "checker", "admin"):
        def login(handle=handle):
            response = client.post(API + "/auth/login/", json={"email": f"{handle}@demo.local", "password": "Demo@12345"})
            response.raise_for_status()
            sessions[handle] = {"Authorization": "Bearer " + response.json()["access"]}
            return get(API + "/auth/me/", sessions[handle])["role"]
        check(f"Login: {handle}", login)
    for handle, paths in {
        "buyer": ["/catalog/listings/", "/orders/orders/", "/orders/bids/", "/orders/requirements/", "/disputes/", "/notifications/"],
        "farmer": ["/catalog/listings/", "/orders/bids/", "/notifications/"],
        "weaver": ["/catalog/listings/", "/orders/bids/", "/notifications/"],
        "checker": ["/verification/queue/"],
        "admin": ["/auth/users/", "/config/verticals/", "/disputes/"],
    }.items():
        if handle not in sessions: continue
        for path in paths:
            check(f"{handle}: {path}", lambda path=path, handle=handle: collection(path, sessions[handle]))
    if "admin" in sessions:
        check("Admin statistics", lambda: get(API + "/auth/admin/stats/", sessions["admin"]))
    for vertical, commodity, region in [("agriculture", "Wheat", "Madhya Pradesh"), ("textiles", "Cotton fabric", "Gujarat"), ("textiles", "Denim", "Gujarat")]:
        params = {"vertical": vertical, "commodity": commodity, "region": region}
        check(f"Market price: {commodity}", lambda params=params: get(COMPUTE + "/pricing/base", params=params)["base_price"])
        def trend(params=params):
            points = get(COMPUTE + "/pricing/trends", params=params)["points"]
            assert len(points) >= 25, f"Only {len(points)} daily prices"
            return len(points)
        check(f"Price chart: {commodity}", trend)
        check(f"Price estimate: {commodity}", lambda params=params: get(COMPUTE + "/pricing/estimate", params={**params, "quantity": 100, "min_grade": "Grade A"})["estimated_total"])
    if "buyer" in sessions:
        def photo():
            listings = get(API + "/catalog/listings/", sessions["buyer"])["results"]
            for listing in listings:
                evidence = get(f"{API}/catalog/listings/{listing['id']}/evidence/", sessions["buyer"])
                items = evidence.get("results", []) if isinstance(evidence, dict) else evidence
                if items:
                    response = client.get(items[0]["file"])
                    response.raise_for_status()
                    assert response.headers["content-type"].startswith("image/")
                    return f"{len(response.content)} bytes"
            raise AssertionError("No listing photo")
        check("Listing photos served locally", photo)

(ROOT / ".demo/readiness.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
failed = [item for item in results if not item["passed"]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
raise SystemExit(bool(failed))
