"""Fill a local database with demo accounts and realistic marketplace data,
so every screen of the web and seller apps has something to show.

    python manage.py seed_verticals
    python manage.py seed_demo            # safe to re-run: skips if demo users exist
    python manage.py seed_demo --reset    # delete the demo users (and their data) first

Every demo account uses the password printed at the end. Local/dev only —
refuses to run when DJANGO_DEBUG is off unless --force is given.
"""

from __future__ import annotations

import io
import random
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import UserProfile
from catalog.models import GradingEvidence, GradingResult, Listing
from config.models import Vertical
from disputes.models import Dispute
from notifications.models import Notification
from orders.models import Bid, Order, OrderAllocation, Requirement
from pricing.models import PricePoint

User = get_user_model()
# Public datasets cloned by ml-training/scripts/prepare_public_datasets.py.
# Not committed (no clear licence to redistribute), so only used when present.
DATASETS = Path(settings.BASE_DIR).parent / "ml-training" / "external"
PASSWORD = "Demo@12345"
DOMAIN = "demo.local"

ACCOUNTS = [
    ("buyer", "BUYER", "Anand Traders", "9800000001"),
    ("farmer", "SELLER", "Ramesh Patil", "9800000002"),
    ("weaver", "SELLER", "Sunita Handloom", "9800000003"),
    ("checker", "VERIFIER", "Priya Sharma", "9800000004"),
]

# commodity, sub-category, quantity, unit, price per unit, state, status, scores
AGRI_LISTINGS = [
    ("Wheat", "Sharbati", 40, "quintal", 2450, "Madhya Pradesh", "ACTIVE", {"foreign_matter": 0.94, "damaged_kernels": 0.9}),
    ("Soybean", "Yellow", 25, "quintal", 4600, "Maharashtra", "ACTIVE", {"foreign_matter": 0.82, "damaged_kernels": 0.7}),
    ("Rice", "Basmati 1121", 30, "quintal", 3900, "Punjab", "ACTIVE", {"foreign_matter": 0.97, "damaged_kernels": 0.92}),
    ("Chana", "Desi", 18, "quintal", 5200, "Rajasthan", "PENDING_VERIFICATION", {"foreign_matter": 0.61, "damaged_kernels": 0.55}),
    ("Maize", "Yellow", 50, "quintal", 2100, "Karnataka", "SOLD", {"foreign_matter": 0.88, "damaged_kernels": 0.8}),
]
TEXTILE_LISTINGS = [
    ("Cotton fabric", "Plain weave, 60s count", 1200, "metre", 145, "Gujarat", "ACTIVE", {"defect_rate": 0.9}),
    ("Denim", "12 oz indigo", 800, "metre", 210, "Gujarat", "PENDING_VERIFICATION", {"defect_rate": 0.58}),
]
MARKET_PRICES = {
    # commodity -> (states, price per quintal around which prices move)
    "Wheat": (["Madhya Pradesh", "Uttar Pradesh", "Punjab"], 2400),
    "Soybean": (["Maharashtra", "Madhya Pradesh"], 4550),
    "Rice": (["Punjab", "Haryana"], 3850),
    "Chana": (["Rajasthan", "Madhya Pradesh"], 5150),
    "Maize": (["Karnataka", "Bihar"], 2050),
}


def _email(handle: str) -> str:
    return f"{handle}@{DOMAIN}"


def _real_photo(commodity: str, seed: int, quality: float) -> bytes | None:
    """A real photo from the public datasets, when they are on this machine:
    the AgroAI wheat sample (the only whole-sample grain photo in it) and
    TILDA fabric photos: clean cloth for good listings, visible defects for
    poor ones."""
    if commodity == "Wheat":
        path = DATASETS / "agroai" / "test3.jpg"
        return _shrink(path) if path.is_file() else None
    labels = DATASETS / "tilda" / "labels"
    if commodity not in ("Cotton fabric", "Denim") or not labels.is_dir():
        return None

    def boxes(label: Path) -> int:  # one defect box per line
        return sum(1 for line in label.read_text().splitlines() if line.strip())

    poor = quality < 0.8
    stems = [label.stem for label in sorted(labels.glob("*.txt")) if (boxes(label) >= 2 if poor else boxes(label) == 0)]
    if not stems:
        return None
    path = DATASETS / "tilda" / "photos" / f"{stems[seed % len(stems)]}.jpg"
    return _shrink(path) if path.is_file() else None


def _shrink(path: Path) -> bytes:
    """Phone-sized JPEG, so demo uploads stay small."""
    try:
        from PIL import Image
    except ImportError:
        return path.read_bytes()
    with Image.open(path) as image:
        image = image.convert("RGB")
        image.thumbnail((1200, 1200))
        return _jpeg(image)


def _grain_photo(seed: int, dirt: float) -> bytes | None:
    """A sample-on-a-sheet photo: grain-coloured kernels scattered on green,
    with a share of dark/odd particles. Drawn, so it has no licence baggage."""
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        return None
    rng = random.Random(seed)
    image = Image.new("RGB", (900, 900), (64, 120, 52))
    draw = ImageDraw.Draw(image)
    for _ in range(420):
        x, y = rng.randint(10, 860), rng.randint(10, 860)
        w, h = rng.randint(30, 40), rng.randint(16, 21)
        if rng.random() < dirt:
            color = rng.choice([(70, 60, 50), (120, 110, 95), (40, 40, 38)])
        else:
            color = (rng.randint(195, 225), rng.randint(150, 175), rng.randint(85, 110))
        angle_box = (x, y, x + w, y + h) if rng.random() < 0.5 else (x, y, x + h, y + w)
        draw.ellipse(angle_box, fill=color)
    return _jpeg(image.filter(ImageFilter.GaussianBlur(0.8)))


def _fabric_photo(seed: int, defects: int) -> bytes | None:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    rng = random.Random(seed)
    image = Image.new("RGB", (900, 600), (228, 224, 214))
    draw = ImageDraw.Draw(image)
    for x in range(0, 900, 6):
        draw.line([(x, 0), (x, 600)], fill=(214, 209, 198), width=2)
    for y in range(0, 600, 6):
        draw.line([(0, y), (900, y)], fill=(206, 201, 190), width=1)
    for _ in range(defects):
        x, y = rng.randint(50, 820), rng.randint(50, 520)
        draw.ellipse((x, y, x + rng.randint(18, 40), y + rng.randint(12, 30)), fill=(150, 130, 95))
    return _jpeg(image)


def _jpeg(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


class Command(BaseCommand):
    help = "Create demo accounts and marketplace data for local use."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing demo users and their data first")
        parser.add_argument("--force", action="store_true", help="Allow running with DJANGO_DEBUG off")

    def handle(self, *args, reset=False, force=False, **options):
        if not settings.DEBUG and not force:
            raise CommandError("seed_demo is for local databases; pass --force to run it with DEBUG off.")
        demo_users = User.objects.filter(email__endswith=f"@{DOMAIN}")
        if reset:
            deleted = demo_users.count()
            # Allocations protect their listings, so clear orders first.
            OrderAllocation.objects.filter(listing__seller__in=demo_users).delete()
            Order.objects.filter(buyer__in=demo_users).delete()
            demo_users.delete()
            PricePoint.objects.filter(raw_data__demo=True).delete()
            self.stdout.write(f"Removed {deleted} demo users and their data.")
        elif demo_users.exists():
            self.stdout.write("Demo data already exists (use --reset to recreate).")
            self._print_logins()
            return
        try:
            agriculture = Vertical.objects.get(slug="agriculture")
            textiles = Vertical.objects.get(slug="textiles")
        except Vertical.DoesNotExist as exc:
            raise CommandError("Run `python manage.py seed_verticals` first.") from exc
        with transaction.atomic():
            self._seed(agriculture, textiles)
        self._print_logins()

    def _print_logins(self):
        self.stdout.write(self.style.SUCCESS(f"\nDemo logins (password for all: {PASSWORD})"))
        for handle, role, name, _ in ACCOUNTS:
            self.stdout.write(f"  {role:9} {_email(handle):22} {name}")
        self.stdout.write(f"  {'ADMIN':9} {_email('admin'):22} Admin")

    def _seed(self, agriculture, textiles):
        now = timezone.now()
        users = {}
        for handle, role, name, phone in ACCOUNTS:
            user = User.objects.create_user(email=_email(handle), password=PASSWORD, role=role, phone=phone)
            UserProfile.objects.update_or_create(user=user, defaults={"display_name": name})
            users[handle] = user
        admin = User.objects.create_superuser(email=_email("admin"), password=PASSWORD)
        UserProfile.objects.update_or_create(user=admin, defaults={"display_name": "Admin"})
        buyer, farmer, weaver, checker = users["buyer"], users["farmer"], users["weaver"], users["checker"]

        listings = {}
        specs = [(agriculture, farmer, s) for s in AGRI_LISTINGS] + [(textiles, weaver, s) for s in TEXTILE_LISTINGS]
        for index, (vertical, seller, spec) in enumerate(specs):
            commodity, sub, qty, unit, price, state, status, scores = spec
            listing = Listing.objects.create(
                seller=seller,
                vertical=vertical,
                commodity_name=commodity,
                sub_category=sub,
                quantity=Decimal(qty),
                unit=unit,
                price_suggested=Decimal(price),
                price_final=Decimal(price),
                region=state,
                status=status,
            )
            listings[commodity] = listing
            quality = sum(scores.values()) / len(scores)
            photo = _real_photo(commodity, index, quality) or (
                _grain_photo(index, dirt=max(0.0, 1 - quality) * 0.6)
                if vertical == agriculture
                else _fabric_photo(index, defects=round((1 - quality) * 20))
            )
            if photo:
                evidence = GradingEvidence(listing=listing, file_type=GradingEvidence.FileType.IMAGE)
                evidence.file.save(f"demo_{commodity.lower().replace(' ', '_')}.jpg", ContentFile(photo), save=True)
            GradingResult.objects.create(
                listing=listing,
                source=GradingResult.Source.AI,
                confidence_score=0.58,
                attribute_scores=scores,
                notes="Checked by the photo model (demo data).",
            )
            if status in ("ACTIVE", "SOLD"):
                GradingResult.objects.create(
                    listing=listing,
                    source=GradingResult.Source.VERIFIER,
                    confidence_score=1.0,
                    attribute_scores=scores,
                    graded_by=checker,
                    notes="Photos match the description.",
                )

        # An open offer, a counter-offer waiting on the buyer, and a done deal.
        Bid.objects.create(
            listing=listings["Wheat"], buyer=buyer, proposed_by=buyer,
            offered_price=Decimal(2380), offered_quantity=Decimal(20), message="Can pick up from the mandi this week.",
        )
        first = Bid.objects.create(
            listing=listings["Soybean"], buyer=buyer, proposed_by=buyer, status=Bid.Status.COUNTERED,
            offered_price=Decimal(4400), offered_quantity=Decimal(25),
        )
        Bid.objects.create(
            listing=listings["Soybean"], buyer=buyer, proposed_by=farmer, parent_bid=first,
            offered_price=Decimal(4520), offered_quantity=Decimal(25), message="Best I can do for clean, dry beans.",
        )
        Bid.objects.create(
            listing=listings["Maize"], buyer=buyer, proposed_by=buyer, status=Bid.Status.ACCEPTED,
            offered_price=Decimal(2100), offered_quantity=Decimal(50),
        )
        fabric_need = Requirement.objects.create(
            buyer=buyer, vertical=textiles, commodity="Cotton fabric", quantity=Decimal(500),
            min_grade="Grade B", max_price=Decimal(150), region="Gujarat", status=Requirement.Status.MATCHED,
        )
        Requirement.objects.create(
            buyer=buyer, vertical=agriculture, commodity="Wheat", quantity=Decimal(20),
            min_grade="Grade A", max_price=Decimal(2500), region="Madhya Pradesh",
        )
        maize_order = Order.objects.create(buyer=buyer, status=Order.Status.CONFIRMED, total_price=Decimal(105000))
        OrderAllocation.objects.create(
            order=maize_order, listing=listings["Maize"], allocated_quantity=Decimal(50),
            unit_price=Decimal(2100), status=OrderAllocation.Status.CONFIRMED,
        )
        fabric_order = Order.objects.create(
            buyer=buyer, requirement=fabric_need, status=Order.Status.PENDING, total_price=Decimal(72500)
        )
        OrderAllocation.objects.create(
            order=fabric_order, listing=listings["Cotton fabric"], allocated_quantity=Decimal(500),
            unit_price=Decimal(145),
        )
        Dispute.objects.create(
            order=maize_order, raised_by=buyer, against=farmer, type=Dispute.Type.QUANTITY_SHORTAGE,
            description="Received 48 quintal, invoice says 50.",
        )

        for user, kind, title, message, read in [
            (buyer, "BID_RECEIVED", "New price from the seller", "Ramesh Patil replied to your soybean offer with ₹4,520 per quintal.", False),
            (buyer, "ORDER_MATCHED", "Order confirmed", "Your maize order (50 quintal) is confirmed.", False),
            (buyer, "SYSTEM", "Welcome to YieldnYarn", "Browse checked produce and make an offer in a few taps.", True),
            (farmer, "BID_RECEIVED", "New offer on your wheat", "Anand Traders offered ₹2,380 per quintal for 20 quintal.", False),
            (farmer, "GRADING_COMPLETE", "Your chana is being checked", "A checker will confirm the quality from your photos soon.", False),
        ]:
            Notification.objects.create(user=user, type=kind, title=title, message=message, is_read=read)

        # 30 days of mandi prices so the price charts and estimates have data.
        rng = random.Random(7)
        points = []
        for commodity, (states, base) in MARKET_PRICES.items():
            for state in states:
                level = base * rng.uniform(0.96, 1.04)
                for day in range(30, -1, -1):
                    level *= rng.uniform(0.985, 1.017)
                    points.append(
                        PricePoint(
                            vertical=agriculture, commodity=commodity, region=state, price=Decimal(round(level, 2)),
                            source=PricePoint.Source.ADMIN_ENTERED, timestamp=now - timedelta(days=day),
                            raw_data={"demo": True},
                        )
                    )
        for day in range(30, -1, -1):
            points.append(
                PricePoint(
                    vertical=textiles, commodity="Cotton fabric", region="Gujarat",
                    price=Decimal(round(140 + 6 * rng.random(), 2)), source=PricePoint.Source.ADMIN_ENTERED,
                    timestamp=now - timedelta(days=day), raw_data={"demo": True},
                )
            )
        PricePoint.objects.bulk_create(points)
        self.stdout.write(
            f"Created {len(listings)} listings, 4 offers, 2 buy requests, 2 orders, 1 complaint, "
            f"5 notifications and {len(points)} market prices."
        )
