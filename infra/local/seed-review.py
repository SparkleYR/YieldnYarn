"""Add repeatable review examples without deleting existing marketplace data."""
from datetime import timedelta
from decimal import Decimal
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend-django"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from accounts.models import UserProfile
from catalog.models import GradingEvidence, GradingResult, Listing
from config.models import Vertical
from config.management.commands.seed_demo import PASSWORD, _grain_photo, _fabric_photo
from disputes.models import Dispute
from notifications.models import Notification
from orders.models import Bid, Order, OrderAllocation, Requirement
from pricing.models import PricePoint
from reputation.models import ReputationScore

User = get_user_model()
now = timezone.now()


def account(handle, role, name):
    user, created = User.objects.get_or_create(email=f"{handle}@demo.local", defaults={"role": role})
    if created:
        user.set_password(PASSWORD)
        user.save(update_fields=["password"])
    UserProfile.objects.get_or_create(user=user, defaults={"display_name": name})
    return user


def notification(user, title, kind="SYSTEM", message="Sample activity for the project review."):
    return Notification.objects.get_or_create(user=user, title=title, defaults={"type": kind, "message": message})[0]


def listing(seller, vertical, commodity, variety, qty, price, state, status, score, seed):
    item, created = Listing.objects.get_or_create(
        seller=seller, commodity_name=commodity, sub_category=variety,
        defaults={"vertical": vertical, "quantity": Decimal(str(qty)), "unit": vertical.unit_of_measure,
                  "price_suggested": Decimal(str(price)), "price_final": Decimal(str(price)),
                  "region": state, "status": status, "location_lat": 23.2599, "location_lng": 77.4126},
    )
    if created:
        scores = {"foreign_matter": score, "damaged_kernels": score} if vertical.slug == "agriculture" else {"defect_rate": score}
        GradingResult.objects.create(listing=item, source="AI", confidence_score=0.58,
                                    attribute_scores=scores, notes="Review sample: AI-assisted preliminary grade.")
        if status == "ACTIVE":
            GradingResult.objects.create(listing=item, source="VERIFIER", confidence_score=1.0,
                                        attribute_scores=scores, graded_by=User.objects.get(email="checker@demo.local"),
                                        notes="Review sample: photos checked by the verifier.")
        photo = _grain_photo(seed, 0.03) if vertical.slug == "agriculture" else _fabric_photo(seed, 2)
        if photo:
            evidence = GradingEvidence(listing=item, file_type="IMAGE")
            evidence.file.save(f"review_{seed}.jpg", ContentFile(photo), save=True)
    return item


with transaction.atomic():
    agri = Vertical.objects.get(slug="agriculture")
    textile = Vertical.objects.get(slug="textiles")
    buyer = User.objects.get(email="buyer@demo.local")
    farmer = User.objects.get(email="farmer@demo.local")
    weaver = User.objects.get(email="weaver@demo.local")
    checker = User.objects.get(email="checker@demo.local")
    mohan = account("mohan", "SELLER", "Mohan Wheat Farm")
    kavita = account("kavita", "SELLER", "Kavita Agro Supplies")
    account("buyer2", "BUYER", "Bhopal Grain Traders")
    wheat2 = listing(mohan, agri, "Wheat", "Lokwan — review stock", 80, 2420, "Madhya Pradesh", "ACTIVE", 0.91, 31)
    wheat3 = listing(kavita, agri, "Wheat", "Sharbati — review stock", 65, 2480, "Madhya Pradesh", "ACTIVE", 0.95, 32)
    listing(farmer, agri, "Rice", "Sona Masoori — review stock", 45, 3200, "Karnataka", "ACTIVE", 0.82, 33)
    queued = listing(farmer, agri, "Wheat", "New harvest — waiting for review", 15, 2390, "Madhya Pradesh", "PENDING_VERIFICATION", 0.68, 34)
    cloth = listing(weaver, textile, "Cotton fabric", "Printed cotton — review stock", 650, 160, "Gujarat", "ACTIVE", 0.94, 35)
    listing(weaver, textile, "Denim", "Stretch denim — waiting for review", 400, 225, "Gujarat", "PENDING_VERIFICATION", 0.62, 36)
    Bid.objects.get_or_create(listing=cloth, buyer=buyer, proposed_by=buyer, message="Review: 100 metres for our shop.",
                             defaults={"offered_price": Decimal("155"), "offered_quantity": Decimal("100")})
    # Manual seeded histories make all status filters and complaint screens meaningful.
    for label, order_status, allocation_status, age in [
        ("Review fulfilled fabric order", "FULFILLED", "DELIVERED", 40),
        ("Review disputed fabric order", "DISPUTED", "CONFIRMED", 3),
        ("Review cancelled fabric order", "CANCELLED", "CANCELLED", 2),
    ]:
        requirement, made = Requirement.objects.get_or_create(
            buyer=buyer, commodity=label,
            defaults={"vertical": textile, "quantity": Decimal("50"), "region": "Gujarat", "status": "FULFILLED" if age == 40 else "MATCHED"},
        )
        if made:
            order = Order.objects.create(buyer=buyer, requirement=requirement, status=order_status, total_price=Decimal("8000"))
            Order.objects.filter(pk=order.pk).update(created_at=now - timedelta(days=age))
            OrderAllocation.objects.create(order=order, listing=cloth, allocated_quantity=Decimal("50"),
                                           unit_price=Decimal("160"), status=allocation_status)
            if order_status in ("FULFILLED", "DISPUTED"):
                resolved = order_status == "FULFILLED"
                Dispute.objects.create(order=order, raised_by=buyer, against=weaver, type="GRADE_MISMATCH",
                                       status="RESOLVED" if resolved else "UNDER_REVIEW",
                                       description="Review example: buyer requested a second fabric quality check.",
                                       resolution_notes="Both parties accepted the verifier's report." if resolved else "Checker is reviewing the photos.",
                                       resolved_at=now - timedelta(days=35) if resolved else None)
    for user in (farmer, weaver, mohan, kavita):
        ReputationScore.objects.get_or_create(user=user, defaults={"role": "SELLER", "score": 4.5,
            "grade_accuracy_score": 0.92, "fulfillment_score": 0.9, "payment_score": 0.0, "total_transactions": 12})
    ReputationScore.objects.get_or_create(user=buyer, defaults={"role": "BUYER", "score": 4.7,
        "grade_accuracy_score": 0.0, "fulfillment_score": 0.9, "payment_score": 0.98, "total_transactions": 18})
    for user in (buyer, farmer, weaver, checker, mohan, kavita):
        notification(user, "Review: welcome to the local marketplace")
        notification(user, "Review: new marketplace activity", "SYSTEM", "Your demonstration data is ready. Open listings, offers and notifications.")
    notification(weaver, "Review: new cotton offer", "BID_RECEIVED", "Anand Traders offered Rs 155/metre for 100 metres of printed cotton.")
    for day in range(31):
        PricePoint.objects.get_or_create(vertical=textile, commodity="Denim", region="Gujarat",
            timestamp=(now - timedelta(days=day)).replace(hour=12, minute=0, second=0, microsecond=0),
            defaults={"price": Decimal(str(205 + day % 7)), "source": "ADMIN_ENTERED", "raw_data": {"demo": True}})
    # Offline feed fixtures populate the feed-source filter without calling
    # an external API. The raw payload explicitly identifies sample data.
    for point in PricePoint.objects.filter(vertical=agri, commodity="Wheat", region="Madhya Pradesh", raw_data__demo=True):
        if point.source != "AGMARKNET":
            point.source = "AGMARKNET"
            point.raw_data = {**point.raw_data, "offline_sample": True, "note": "Synthetic feed example for the local review; not a live API observation."}
            point.save(update_fields=["source", "raw_data"])

manifest = {
    "password": PASSWORD,
    "accounts": {u.role.lower() + ':' + u.email: u.pk for u in User.objects.filter(email__endswith="@demo.local")},
    "queued_listing": queued.pk,
    "multi_seller_wheat": [wheat2.pk, wheat3.pk],
    "counts": {"listings": Listing.objects.count(), "orders": Order.objects.count(), "bids": Bid.objects.count(),
               "requirements": Requirement.objects.count(), "complaints": Dispute.objects.count(),
               "notifications": Notification.objects.count(), "market_prices": PricePoint.objects.count()},
}
(ROOT / ".demo").mkdir(exist_ok=True)
(ROOT / ".demo/demo-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("Review data ready:", json.dumps(manifest["counts"]))
