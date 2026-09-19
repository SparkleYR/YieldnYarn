from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ReputationScore

User = get_user_model()


class ReputationDetailViewTest(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(email="viewer@example.com", password="pw12345", role="BUYER")
        self.seller = User.objects.create_user(email="seller@example.com", password="pw12345", role="SELLER")

    def test_returns_existing_score(self):
        ReputationScore.objects.create(
            user=self.seller, role="SELLER", score=4.7, total_transactions=12
        )
        self.client.force_authenticate(user=self.viewer)

        response = self.client.get(f"/api/reputation/{self.seller.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["score"], 4.7)
        self.assertEqual(response.data["total_transactions"], 12)

    def test_returns_zeroed_default_when_no_score_yet(self):
        self.client.force_authenticate(user=self.viewer)

        response = self.client.get(f"/api/reputation/{self.seller.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["score"], 0.0)
        self.assertEqual(response.data["role"], "SELLER")
        self.assertEqual(response.data["total_transactions"], 0)
        # The zeroed default is transient — GET must not persist a row.
        self.assertFalse(ReputationScore.objects.filter(user=self.seller).exists())

    def test_unknown_user_returns_404(self):
        self.client.force_authenticate(user=self.viewer)

        response = self.client.get("/api/reputation/999999/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_cannot_view(self):
        response = self.client.get(f"/api/reputation/{self.seller.id}/")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
