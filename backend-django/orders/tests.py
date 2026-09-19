from unittest.mock import MagicMock, patch

import httpx
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from catalog.models import Listing
from config.models import Vertical
from notifications.models import Notification

from .models import Bid, Order, OrderAllocation, Requirement

User = get_user_model()


class RequirementViewSetTest(APITestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.other_buyer = User.objects.create_user(email="buyer2@example.com", password="pw12345", role="BUYER")
        self.seller = User.objects.create_user(email="seller@example.com", password="pw12345", role="SELLER")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")

        self.open_req = Requirement.objects.create(
            buyer=self.buyer, vertical=self.vertical, commodity="Wheat", quantity=100, status="OPEN"
        )
        self.matched_req = Requirement.objects.create(
            buyer=self.other_buyer, vertical=self.vertical, commodity="Rice", quantity=50, status="MATCHED"
        )

    def test_buyer_only_sees_own_requirements(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get("/api/orders/requirements/")

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["commodity"], "Wheat")

    def test_seller_only_sees_open_requirements(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.get("/api/orders/requirements/")

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["commodity"], "Wheat")

    def test_admin_sees_all_requirements(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/orders/requirements/")

        self.assertEqual(response.data["count"], 2)

    def test_create_sets_buyer_to_requesting_user(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/orders/requirements/",
            {"vertical": self.vertical.id, "commodity": "Chana", "quantity": "40.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["buyer"], self.buyer.id)
        self.assertEqual(response.data["search_radius_km"], 100.0)  # model default
        self.assertEqual(response.data["region"], "")  # model default

    def test_create_persists_free_text_region(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/orders/requirements/",
            {
                "vertical": self.vertical.id,
                "commodity": "Chana",
                "quantity": "40.00",
                "region": "Uttar Pradesh",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["region"], "Uttar Pradesh")
        self.assertIsNone(response.data["region_lat"])  # independent of the free-text label

    def test_buyer_cannot_retrieve_another_buyers_requirement(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(f"/api/orders/requirements/{self.matched_req.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RequirementMatchActionTest(APITestCase):
    """POST /api/orders/requirements/{id}/match/ — proxies to FastAPI's
    /compute/matching/allocate (orders/views.py:RequirementViewSet.trigger_match).

    Before this existed, nothing in the codebase ever called the matching
    engine at all — posting a requirement did nothing beyond persisting the
    row, despite the UI's own copy promising "the matching engine finds
    sellers for you"."""

    def setUp(self):
        self.buyer = User.objects.create_user(email="buyer3@example.com", password="pw12345", role="BUYER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture-match", unit_of_measure="kg")
        self.requirement = Requirement.objects.create(
            buyer=self.buyer, vertical=self.vertical, commodity="Wheat", quantity=100, status="OPEN"
        )
        self.url = f"/api/orders/requirements/{self.requirement.id}/match/"
        self.client.force_authenticate(user=self.buyer)

    @patch("orders.views.httpx.post")
    def test_successful_match_notifies_the_buyer(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "order_id": 42,
                "allocations": [{"listing_id": 7, "allocated_quantity": 100.0, "unit_price": 2000.0}],
                "total_price": 200000.0,
                "fully_fulfilled": True,
                "shortfall": 0,
            },
        )
        self.requirement.status = "MATCHED"  # what the FastAPI call would have set in real Postgres
        self.requirement.save(update_fields=["status"])

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["matched"])
        self.assertEqual(response.data["order_id"], 42)

        mock_post.assert_called_once()
        called_url = mock_post.call_args.args[0]
        self.assertTrue(called_url.endswith("/compute/matching/allocate"))
        self.assertEqual(mock_post.call_args.kwargs["json"], {"requirement_id": self.requirement.id})

        notification = Notification.objects.get(user=self.buyer)
        self.assertEqual(notification.type, Notification.Type.ORDER_MATCHED)
        self.assertEqual(notification.title, "Requirement matched")
        self.assertIn("Order #42", notification.message)
        self.assertEqual(notification.related_object_id, 42)

    @patch("orders.views.httpx.post")
    def test_partial_match_notification_says_partially_matched(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "order_id": 43,
                "allocations": [{"listing_id": 7, "allocated_quantity": 25.0, "unit_price": 2000.0}],
                "total_price": 50000.0,
                "fully_fulfilled": False,
                "shortfall": 75,
            },
        )

        self.client.post(self.url)

        notification = Notification.objects.get(user=self.buyer)
        self.assertEqual(notification.title, "Requirement partially matched")

    @patch("orders.views.httpx.post")
    def test_no_match_yet_returns_200_matched_false_without_a_notification(self, mock_post):
        mock_post.return_value = MagicMock(status_code=409, text="no matching listings available for this requirement")

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["matched"])
        self.assertEqual(Notification.objects.count(), 0)

    @patch("orders.views.httpx.post")
    def test_service_unreachable_returns_503(self, mock_post):
        mock_post.side_effect = httpx.ConnectError("connection refused")

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(response.data["matched"])

    def test_seller_cannot_trigger_match_on_someone_elses_requirement(self):
        # Sellers can list OPEN requirements as demand signals (get_queryset),
        # but IsOwnerOrAdmin's object-level check only recognizes buyer_id —
        # so a detail action like this one is still 403, not something a
        # non-owning seller can trigger.
        seller = User.objects.create_user(email="seller3@example.com", password="pw12345", role="SELLER")
        self.client.force_authenticate(user=seller)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class OrderViewSetTest(APITestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.other_buyer = User.objects.create_user(email="buyer2@example.com", password="pw12345", role="BUYER")
        self.seller = User.objects.create_user(email="seller@example.com", password="pw12345", role="SELLER")
        self.other_seller = User.objects.create_user(email="seller2@example.com", password="pw12345", role="SELLER")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")

        self.listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Wheat",
            quantity=100, unit="kg", status="ACTIVE",
        )
        self.order = Order.objects.create(buyer=self.buyer, status="CONFIRMED", total_price=1000)
        self.order.allocations.create(listing=self.listing, allocated_quantity=10, unit_price=100, status="PENDING")

        self.other_order = Order.objects.create(buyer=self.other_buyer, status="PENDING", total_price=500)

    def test_buyer_only_sees_own_orders(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get("/api/orders/orders/")

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.order.id)

    def test_allocations_include_denormalized_listing_fields(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get("/api/orders/orders/")

        allocation = response.data["results"][0]["allocations"][0]
        self.assertEqual(allocation["commodity_name"], "Wheat")
        self.assertEqual(allocation["unit"], "kg")
        self.assertEqual(allocation["seller_name"], self.seller.email)  # no profile set

    def test_seller_sees_orders_allocated_from_their_listings(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.get("/api/orders/orders/")

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.order.id)

    def test_unrelated_seller_sees_no_orders(self):
        self.client.force_authenticate(user=self.other_seller)

        response = self.client.get("/api/orders/orders/")

        self.assertEqual(response.data["count"], 0)

    def test_admin_sees_all_orders(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get("/api/orders/orders/")

        self.assertEqual(response.data["count"], 2)

    def test_orders_are_read_only(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/orders/orders/", {"status": "PENDING", "total_price": "500.00"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class BidViewSetTest(APITestCase):
    def setUp(self):
        self.buyer = User.objects.create_user(email="buyer@example.com", password="pw12345", role="BUYER")
        self.other_buyer = User.objects.create_user(email="buyer2@example.com", password="pw12345", role="BUYER")
        self.seller = User.objects.create_user(email="seller@example.com", password="pw12345", role="SELLER")
        self.stranger_seller = User.objects.create_user(email="seller2@example.com", password="pw12345", role="SELLER")
        self.admin = User.objects.create_superuser(email="admin@example.com", password="pw12345")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="kg")

        self.listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Wheat",
            quantity=100, unit="kg", status="ACTIVE",
        )
        self.bid = Bid.objects.create(
            listing=self.listing, buyer=self.buyer, offered_price=2000, offered_quantity=50
        )
        self.detail_url = f"/api/orders/bids/{self.bid.id}/"

    def test_buying_party_can_retrieve(self):
        self.client.force_authenticate(user=self.buyer)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_listing_owner_can_retrieve(self):
        self.client.force_authenticate(user=self.seller)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_unrelated_seller_cannot_see_it_in_list(self):
        self.client.force_authenticate(user=self.stranger_seller)
        response = self.client.get("/api/orders/bids/")
        self.assertEqual(response.data["count"], 0)

    def test_unrelated_buyer_cannot_see_it_in_list(self):
        self.client.force_authenticate(user=self.other_buyer)
        response = self.client.get("/api/orders/bids/")
        self.assertEqual(response.data["count"], 0)

    def test_create_sets_buyer_to_requesting_user(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(
            "/api/orders/bids/",
            {"listing": self.listing.id, "offered_price": "2100.00", "offered_quantity": "40.00"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["buyer"], self.buyer.id)

    def test_create_notifies_the_listing_owner(self):
        self.client.force_authenticate(user=self.buyer)

        self.client.post(
            "/api/orders/bids/",
            {"listing": self.listing.id, "offered_price": "2100.00", "offered_quantity": "40.00"},
            format="json",
        )

        # self.bid in setUp is created directly via Bid.objects.create(),
        # bypassing BidSerializer.create() (and so its notification) — only
        # this POST goes through the real API.
        notification = Notification.objects.get(user=self.seller)
        self.assertEqual(notification.type, Notification.Type.BID_RECEIVED)
        self.assertIn("Wheat", notification.message)

    def test_listing_owner_can_accept_bid(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.bid.refresh_from_db()
        self.assertEqual(self.bid.status, Bid.Status.ACCEPTED)

    def test_accepting_a_bid_creates_a_real_order_and_allocation(self):
        # Regression check: accepting used to be a pure status flip — no
        # Order/OrderAllocation ever materialized, so the buyer's "my
        # orders" page would never show a bid they'd successfully closed.
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(Order.objects.count(), 1)
        order = Order.objects.get()
        self.assertEqual(order.buyer_id, self.buyer.id)
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(order.total_price, 2000 * 50)

        self.assertEqual(OrderAllocation.objects.count(), 1)
        allocation = OrderAllocation.objects.get()
        self.assertEqual(allocation.order_id, order.id)
        self.assertEqual(allocation.listing_id, self.listing.id)
        self.assertEqual(allocation.allocated_quantity, 50)
        self.assertEqual(allocation.unit_price, 2000)
        self.assertEqual(allocation.status, OrderAllocation.Status.CONFIRMED)

    def test_accepting_a_bid_notifies_the_buyer(self):
        self.client.force_authenticate(user=self.seller)

        self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        notification = Notification.objects.get(user=self.buyer)
        self.assertEqual(notification.type, Notification.Type.ORDER_MATCHED)
        order = Order.objects.get()
        self.assertEqual(notification.related_object_type, "order")
        self.assertEqual(notification.related_object_id, order.id)

    def test_rejecting_a_bid_notifies_the_buyer(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(self.detail_url, {"status": "REJECTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification = Notification.objects.get(user=self.buyer)
        self.assertEqual(notification.type, Notification.Type.SYSTEM)
        self.assertIn("rejected", notification.message)
        self.assertEqual(Order.objects.count(), 0)

    def test_accepting_a_bid_decrements_listing_quantity(self):
        self.client.force_authenticate(user=self.seller)

        self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.quantity, 50)  # 100 - 50
        self.assertEqual(self.listing.status, "ACTIVE")  # not exhausted

    def test_accepting_a_bid_for_the_full_quantity_marks_listing_sold(self):
        full_bid = Bid.objects.create(
            listing=self.listing, buyer=self.buyer, offered_price=1900, offered_quantity=100
        )
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(f"/api/orders/bids/{full_bid.id}/", {"status": "ACCEPTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.quantity, 0)
        self.assertEqual(self.listing.status, "SOLD")

    def test_buyer_cannot_accept_their_own_bid(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.bid.refresh_from_db()
        self.assertEqual(self.bid.status, Bid.Status.PENDING)
        self.assertEqual(Order.objects.count(), 0)

    def test_buyer_cannot_reject_their_own_bid(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.patch(self.detail_url, {"status": "REJECTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_accept_a_bid_on_someone_elses_listing(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.count(), 1)

    def test_re_accepting_an_already_accepted_bid_does_not_double_book(self):
        self.bid.status = Bid.Status.ACCEPTED
        self.bid.save(update_fields=["status"])
        self.client.force_authenticate(user=self.seller)

        response = self.client.patch(self.detail_url, {"status": "ACCEPTED"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Order.objects.count(), 0)
