from django.contrib.auth import get_user_model
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
