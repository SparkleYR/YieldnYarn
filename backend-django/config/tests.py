from io import StringIO

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import GradingSchema, PricingRule, Vertical

User = get_user_model()


class VerticalViewSetTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")

    def test_authenticated_user_can_list(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get("/api/config/verticals/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_unauthenticated_cannot_list(self):
        response = self.client.get("/api/config/verticals/")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/config/verticals/",
            {"name": "Textiles", "slug": "textiles", "unit_of_measure": "meter"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            "/api/config/verticals/",
            {"name": "Textiles", "slug": "textiles", "unit_of_measure": "meter"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Vertical.objects.filter(slug="textiles").exists())

    def test_non_admin_cannot_delete(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.delete(f"/api/config/verticals/{self.vertical.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Vertical.objects.filter(id=self.vertical.id).exists())


class GradingSchemaDetailViewTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")
        self.url = f"/api/config/verticals/{self.vertical.id}/grading-schema/"

    def test_get_creates_schema_on_first_access(self):
        self.assertFalse(GradingSchema.objects.filter(vertical=self.vertical).exists())
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["attributes"], [])
        self.assertTrue(GradingSchema.objects.filter(vertical=self.vertical).exists())

    def test_admin_can_put_attributes(self):
        self.client.force_authenticate(user=self.admin)
        attributes = [{"name": "moisture", "weight": 1.0, "gradeable_by_ml": True}]

        response = self.client.put(self.url, {"attributes": attributes}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["attributes"], attributes)
        schema = GradingSchema.objects.get(vertical=self.vertical)
        self.assertEqual(schema.attributes, attributes)

    def test_non_admin_cannot_put(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.put(self.url, {"attributes": []}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class PricingRuleDetailViewTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")
        self.url = f"/api/config/verticals/{self.vertical.id}/pricing-rules/"

    def test_get_creates_rule_on_first_access(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["rules"], {})
        self.assertTrue(PricingRule.objects.filter(vertical=self.vertical).exists())

    def test_admin_can_put_rules(self):
        self.client.force_authenticate(user=self.admin)
        rules = {"grade_adjustment_table": [{"grade": "Grade A", "multiplier": 1.05}]}

        response = self.client.put(self.url, {"rules": rules}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rule = PricingRule.objects.get(vertical=self.vertical)
        self.assertEqual(rule.rules, rules)

    def test_non_admin_cannot_put(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.put(self.url, {"rules": {}}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MissingVerticalTest(APITestCase):
    def test_schema_and_rules_for_an_unknown_vertical_are_404_not_500(self):
        admin = User.objects.create_superuser(email="cfg-admin@example.com", password="pw12345")
        self.client.force_authenticate(user=admin)
        self.assertEqual(self.client.get("/api/config/verticals/999999/grading-schema/").status_code, 404)
        self.assertEqual(self.client.get("/api/config/verticals/999999/pricing-rules/").status_code, 404)


class SeedVerticalsTest(TestCase):
    def test_seeds_verticals_idempotently(self):
        from django.core.management import call_command

        call_command("seed_verticals", stdout=StringIO())
        call_command("seed_verticals", stdout=StringIO())
        self.assertEqual(Vertical.objects.filter(slug__in=["agriculture", "textiles"]).count(), 2)
        agriculture = Vertical.objects.get(slug="agriculture")
        ml = [a["name"] for a in agriculture.grading_schema.attributes if a["gradeable_by_ml"]]
        self.assertEqual(ml, ["foreign_matter", "damaged_kernels"])
        # Grade names must match what grading produces ("Grade A"), or the
        # quality price adjustment silently never applies.
        grades = [row["grade"] for row in agriculture.pricing_rule.rules["grade_adjustment_table"]]
        self.assertEqual(grades, ["Grade A", "Grade B", "Grade C"])

    def test_update_keeps_existing_vertical_but_resets_schema(self):
        from django.core.management import call_command

        vertical = Vertical.objects.create(slug="textiles", name="Fabric", unit_of_measure="metre")
        GradingSchema.objects.create(vertical=vertical, attributes=[])
        call_command("seed_verticals", update=True, stdout=StringIO())
        vertical.refresh_from_db()
        self.assertEqual(vertical.name, "Fabric")
        self.assertEqual(vertical.grading_schema.attributes[0]["name"], "defect_rate")


@override_settings(DEBUG=True)
class SeedDemoTest(TestCase):
    def test_seeds_resets_and_refuses_without_debug(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError

        from catalog.models import Listing

        call_command("seed_verticals", stdout=StringIO())
        call_command("seed_demo", stdout=StringIO())
        self.assertEqual(Listing.objects.filter(seller__email__endswith="@demo.local").count(), 7)
        call_command("seed_demo", stdout=StringIO())  # no-op when present
        self.assertEqual(Listing.objects.filter(seller__email__endswith="@demo.local").count(), 7)
        call_command("seed_demo", reset=True, stdout=StringIO())  # orders protect listings: must not crash
        self.assertEqual(Listing.objects.filter(seller__email__endswith="@demo.local").count(), 7)
        with override_settings(DEBUG=False), self.assertRaises(CommandError):
            call_command("seed_demo", stdout=StringIO())
