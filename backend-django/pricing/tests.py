from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from config.models import Vertical

from .models import PricePoint

User = get_user_model()


class PricePointListViewTest(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")
        self.url = "/api/pricing/price-points/"

    def _payload(self, **overrides):
        payload = {
            "vertical": self.vertical.id,
            "commodity": "Wheat",
            "region": "Jaipur, Rajasthan",
            "price": "2450.00",
            "source": "ADMIN_ENTERED",
            "timestamp": timezone.now().isoformat(),
        }
        payload.update(overrides)
        return payload

    def test_any_authenticated_user_can_list(self):
        PricePoint.objects.create(
            vertical=self.vertical, commodity="Wheat", region="Jaipur", price=2450,
            source="AGMARKNET", timestamp=timezone.now(),
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_unauthenticated_cannot_list(self):
        response = self.client.get(self.url)
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_non_admin_cannot_create(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(PricePoint.objects.exists())

    def test_admin_can_create(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, self._payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(PricePoint.objects.filter(commodity="Wheat", region="Jaipur, Rajasthan").exists())

    def test_filters_by_vertical(self):
        textiles = Vertical.objects.create(name="Textiles", slug="textiles", unit_of_measure="meter")
        PricePoint.objects.create(
            vertical=self.vertical, commodity="Wheat", region="Jaipur", price=2450,
            source="AGMARKNET", timestamp=timezone.now(),
        )
        PricePoint.objects.create(
            vertical=textiles, commodity="Cotton", region="Surat", price=70,
            source="ADMIN_ENTERED", timestamp=timezone.now(),
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url, {"vertical": textiles.id})

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["commodity"], "Cotton")
