"""Create the launch verticals (Agriculture, Textiles) with grading schemas
and pricing rules, so a fresh database is usable without the admin UI.

The ML-gradeable attributes match the graders shipped in
ml-training/checkpoints/<slug>/grader.pt (see ml-training/configs/*.json).

Idempotent: existing verticals are left alone unless --update is passed, in
which case their grading schema and pricing rules are overwritten.

    python manage.py seed_verticals [--update]
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from config.models import GradingSchema, PricingRule, Vertical

GRADE_ADJUSTMENTS = [
    {"grade": "A", "multiplier": 1.1},
    {"grade": "B", "multiplier": 1.0},
    {"grade": "C", "multiplier": 0.88},
]

VERTICALS = [
    {
        "slug": "agriculture",
        "name": "Agriculture",
        "unit_of_measure": "quintal",
        "attributes": [
            {"name": "foreign_matter", "type": "percentage", "range": [0, 100], "ideal_value": 0,
             "weight": 0.5, "gradeable_by_ml": True},
            {"name": "damaged_kernels", "type": "percentage", "range": [0, 100], "ideal_value": 0,
             "weight": 0.5, "gradeable_by_ml": True},
            {"name": "moisture", "type": "percentage", "range": [0, 30], "ideal_value": 12,
             "weight": 0.0, "gradeable_by_ml": False},
        ],
        "quantity_tiers": [
            {"min_quantity": 0, "multiplier": 1.0},
            {"min_quantity": 50, "multiplier": 0.98},
            {"min_quantity": 200, "multiplier": 0.95},
        ],
    },
    {
        "slug": "textiles",
        "name": "Textiles",
        "unit_of_measure": "metre",
        "attributes": [
            {"name": "defect_rate", "type": "percentage", "range": [0, 100], "ideal_value": 0,
             "weight": 1.0, "gradeable_by_ml": True},
            {"name": "gsm", "type": "number", "range": [30, 600], "ideal_value": None,
             "weight": 0.0, "gradeable_by_ml": False},
        ],
        "quantity_tiers": [
            {"min_quantity": 0, "multiplier": 1.0},
            {"min_quantity": 500, "multiplier": 0.97},
            {"min_quantity": 2000, "multiplier": 0.94},
        ],
    },
]


class Command(BaseCommand):
    help = "Create the Agriculture and Textiles verticals with grading schemas and pricing rules."

    def add_arguments(self, parser):
        parser.add_argument(
            "--update", action="store_true", help="Overwrite schemas and pricing rules of existing verticals"
        )

    @transaction.atomic
    def handle(self, *args, update=False, **options):
        for spec in VERTICALS:
            vertical, created = Vertical.objects.get_or_create(
                slug=spec["slug"],
                defaults={"name": spec["name"], "unit_of_measure": spec["unit_of_measure"]},
            )
            schema, schema_created = GradingSchema.objects.get_or_create(
                vertical=vertical, defaults={"attributes": spec["attributes"]}
            )
            rules = {"grade_adjustment_table": GRADE_ADJUSTMENTS, "quantity_tier_table": spec["quantity_tiers"]}
            pricing, pricing_created = PricingRule.objects.get_or_create(vertical=vertical, defaults={"rules": rules})
            if update:
                schema.attributes = spec["attributes"]
                schema.save(update_fields=["attributes", "updated_at"])
                pricing.rules = rules
                pricing.save(update_fields=["rules", "updated_at"])
            state = "created" if created else ("updated" if update else "exists")
            self.stdout.write(f"{spec['slug']}: {state}")
