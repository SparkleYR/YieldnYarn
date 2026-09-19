from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from config.models import Vertical
from notifications.models import Notification
from orders.models import Order

from .models import Dispute

User = get_user_model()


class DisputeViewSetTest(APITestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.seller = User.objects.create_user(email="seller@example.com", password="pw12345", role="SELLER")
        self.stranger = User.objects.create_user(email="stranger@example.com", password="pw12345", role="BUYER")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")

        self.order = Order.objects.create(buyer=self.buyer, status="CONFIRMED", total_price=1000)
        self.dispute = Dispute.objects.create(
            order=self.order,
            raised_by=self.buyer,
            against=self.seller,
            type=Dispute.Type.QUANTITY_SHORTAGE,
            description="Received less than ordered.",
        )
        self.detail_url = f"/api/disputes/{self.dispute.id}/"

    def test_raised_by_party_sees_it_in_list(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get("/api/disputes/")
        self.assertEqual(response.data["count"], 1)

    def test_list_includes_denormalized_party_names(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get("/api/disputes/")
        item = response.data["results"][0]
        self.assertEqual(item["raised_by_name"], self.buyer.email)  # no profile set
        self.assertEqual(item["against_name"], self.seller.email)

    def test_against_party_sees_it_in_list(self):
        self.client.force_authenticate(user=self.seller)
        response = self.client.get("/api/disputes/")
        self.assertEqual(response.data["count"], 1)

    def test_unrelated_user_does_not_see_it_in_list(self):
        self.client.force_authenticate(user=self.stranger)
        response = self.client.get("/api/disputes/")
        self.assertEqual(response.data["count"], 0)

    def test_raised_by_party_can_retrieve(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_against_party_can_retrieve(self):
        # Regression check for the owner_fields gap fixed in core/permissions.py —
        # the against-party must be able to open a dispute raised against them,
        # not just see it listed.
        self.client.force_authenticate(user=self.seller)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_can_retrieve(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unrelated_user_cannot_retrieve(self):
        self.client.force_authenticate(user=self.stranger)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_sets_raised_by_to_requesting_user(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/disputes/",
            {
                "order": self.order.id,
                "against": self.seller.id,
                "type": "GRADE_MISMATCH",
                "description": "Grade did not match listing.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["raised_by"], self.buyer.id)

    def test_updating_status_to_resolved_sets_resolved_at(self):
        self.client.force_authenticate(user=self.seller)
        self.assertIsNone(self.dispute.resolved_at)

        response = self.client.patch(self.detail_url, {"status": "RESOLVED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.dispute.refresh_from_db()
        self.assertEqual(self.dispute.status, Dispute.Status.RESOLVED)
        self.assertIsNotNone(self.dispute.resolved_at)

    def test_status_change_notifies_both_parties(self):
        self.client.force_authenticate(user=self.seller)

        self.client.patch(self.detail_url, {"status": "UNDER_REVIEW"}, format="json")

        buyer_notification = Notification.objects.get(user=self.buyer)
        seller_notification = Notification.objects.get(user=self.seller)
        self.assertEqual(buyer_notification.type, Notification.Type.DISPUTE_UPDATE)
        self.assertEqual(seller_notification.type, Notification.Type.DISPUTE_UPDATE)
        self.assertIn("Under Review", buyer_notification.message)

    def test_updating_only_resolution_notes_does_not_notify(self):
        self.client.force_authenticate(user=self.seller)

        self.client.patch(self.detail_url, {"resolution_notes": "Investigating"}, format="json")

        self.assertEqual(Notification.objects.count(), 0)
