"""Exercise original dataset photos through the running local marketplace.

Retains clearly named review listings on the existing demo seller accounts.
Source labels are provenance, not assertions about the model's predicted grade.
Run after downloading the photos into .demo/real-images/photos.
"""
import hashlib
import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / ".demo/real-images"
API = "http://127.0.0.1:8000/api"


def main():
    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    by_name = {entry["filename"]: entry for entry in manifest}
    cases = [
        ("Wheat source A", "agriculture", ["wheat-source-A-1.jpg", "wheat-source-A-2.jpg"]),
        ("Wheat source D", "agriculture", ["wheat-source-D-1.jpg", "wheat-source-D-2.jpg"]),
        ("Wheat source F", "agriculture", ["wheat-source-F-1.jpg", "wheat-source-F-2.jpg"]),
        ("Cotton slub", "textiles", ["cotton-slub-1.jpg", "cotton-slub-2.jpg"]),
        ("Cotton knot", "textiles", ["cotton-knot-1.jpg", "cotton-knot-2.jpg"]),
        ("Cotton oil", "textiles", ["cotton-oil-1.jpg", "cotton-oil-2.jpg"]),
        ("Cotton hole", "textiles", ["cotton-hole-1.jpg", "cotton-hole-2.jpg"]),
        ("Wheat green-sheet reference", "agriculture", ["wheat-green-sheet-reference.jpg"]),
    ]
    report = []
    with httpx.Client(timeout=180) as client:
        def call(method, path, token=None, **kwargs):
            headers = {"Authorization": f"Bearer {token}"} if token else None
            response = client.request(method, API + path, headers=headers, **kwargs)
            response.raise_for_status()
            return response.json()

        tokens = {
            slug: call("POST", "/auth/login/", json={"email": email, "password": "Demo@12345"})["access"]
            for slug, email in [("agriculture", "farmer@demo.local"), ("textiles", "weaver@demo.local")]
        }
        verticals = call("GET", "/config/verticals/", tokens["agriculture"])["results"]
        for name, slug, files in cases:
            token = tokens[slug]
            sub_category = f"Real dataset - {name}"
            listings = call("GET", "/catalog/listings/", token, params={"page_size": 100})["results"]
            listing = next((item for item in listings if item["sub_category"] == sub_category), None)
            if listing is None:
                vertical = next(item["id"] for item in verticals if item["slug"] == slug)
                listing = call("POST", "/catalog/listings/", token, json={
                    "vertical": vertical,
                    "commodity_name": "Wheat" if slug == "agriculture" else "Cotton fabric",
                    "sub_category": sub_category,
                    "quantity": 2 if slug == "agriculture" else 10,
                    "unit": "quintal" if slug == "agriculture" else "metre",
                    "price_suggested": 2450 if slug == "agriculture" else 145,
                    "region": "Madhya Pradesh" if slug == "agriculture" else "Gujarat",
                })
                for filename in files:
                    path = DATA / "photos" / filename
                    assert hashlib.sha256(path.read_bytes()).hexdigest() == by_name[filename]["sha256"]
                    with path.open("rb") as photo:
                        call("POST", f"/catalog/listings/{listing['id']}/evidence/", token,
                             files={"file": (filename, photo, "image/jpeg")}, data={"file_type": "IMAGE"})
            grade = call("POST", f"/catalog/listings/{listing['id']}/grading/trigger/", token)
            final = call("GET", f"/catalog/listings/{listing['id']}/", token)
            assert not grade.get("persistence_error"), grade
            assert all(0 <= score <= 1 for score in grade["attribute_scores"].values()), grade
            assert final["grade"] == grade["grade"], (final, grade)
            if grade["needs_verification"]:
                assert final["status"] == "PENDING_VERIFICATION", final
            row = {"case": name, "listing_id": listing["id"], "status": final["status"],
                   "images": [by_name[filename] for filename in files], "result": grade}
            report.append(row)
            (DATA / "grading-results.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(f"{name}: listing {listing['id']}, {grade['grade']}, "
                  f"confidence {grade['overall_confidence']:.2%}, {grade['method']}", flush=True)
    print(f"Completed {len(report)} real-photo workflows; listings retained for faculty review.")


if __name__ == "__main__":
    main()
