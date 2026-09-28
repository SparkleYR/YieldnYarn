from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APITestCase

from orders.models import Order

User = get_user_model()


class AuthFlowSmokeTest(APITestCase):
    def test_register_login_me_flow(self):
        register_url = reverse("auth-register")
        payload = {
            "email": "seller1@example.com",
            "phone": "9999999999",
            "password": "SuperSecret123",
            "role": "SELLER",
            "display_name": "Seller One",
        }
        response = self.client.post(register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            User.objects.filter(email="seller1@example.com").exists()
        )

        login_url = reverse("auth-login")
        response = self.client.post(
            login_url,
            {"email": "seller1@example.com", "password": "SuperSecret123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

        access_token = response.data["access"]
        me_url = reverse("auth-me")
        response = self.client.get(
            me_url, HTTP_AUTHORIZATION=f"Bearer {access_token}"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "seller1@example.com")
        self.assertEqual(response.data["role"], "SELLER")

    def test_cannot_self_register_as_admin(self):
        register_url = reverse("auth-register")
        payload = {
            "email": "wannabe-admin@example.com",
            "password": "SuperSecret123",
            "role": "ADMIN",
        }
        response = self.client.post(register_url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AdminUserManagementTest(APITestCase):
    """GET/PATCH /api/auth/users/ — admin-only list + is_active toggle
    (accounts/views.py:AdminUserViewSet)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin@example.com", password="pw12345"
        )
        self.buyer = User.objects.create_user(
            email="buyer@example.com", password="pw12345", role="BUYER"
        )

    def test_admin_can_list_users(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse("admin-user-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = {u["email"] for u in response.data["results"]}
        self.assertEqual(emails, {"admin@example.com", "buyer@example.com"})

    def test_non_admin_cannot_list_users(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(reverse("admin-user-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_toggle_is_active(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[self.buyer.id]),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.buyer.refresh_from_db()
        self.assertFalse(self.buyer.is_active)

    def test_admin_cannot_change_role_via_this_endpoint(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse("admin-user-detail", args=[self.buyer.id]),
            {"role": "ADMIN"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.role, "BUYER")


class AdminStatsTest(APITestCase):
    """GET /api/auth/admin/stats/ (accounts/views.py:AdminStatsView)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            email="admin2@example.com", password="pw12345"
        )
        self.buyer = User.objects.create_user(
            email="buyer2@example.com", password="pw12345", role="BUYER"
        )

    def test_non_admin_forbidden(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(reverse("auth-admin-stats"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_counts_and_revenue_only_include_committed_orders(self):
        Order.objects.create(buyer=self.buyer, status=Order.Status.CONFIRMED, total_price=Decimal("1000.00"))
        Order.objects.create(buyer=self.buyer, status=Order.Status.FULFILLED, total_price=Decimal("500.00"))
        Order.objects.create(buyer=self.buyer, status=Order.Status.PENDING, total_price=Decimal("999.00"))
        Order.objects.create(buyer=self.buyer, status=Order.Status.CANCELLED, total_price=Decimal("999.00"))
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse("auth-admin-stats"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_orders"], 4)
        self.assertEqual(response.data["total_users"], 2)
        self.assertEqual(Decimal(response.data["revenue"]), Decimal("1500.00"))

    def test_revenue_delta_pct_none_without_last_month_data(self):
        Order.objects.create(buyer=self.buyer, status=Order.Status.CONFIRMED, total_price=Decimal("100.00"))
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse("auth-admin-stats"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["revenue_delta_pct"])


class PasswordResetTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="reset-me@example.com", password="OldPassword123", role="BUYER"
        )

    def test_request_for_existing_user_sends_a_real_email_with_a_working_link(self):
        response = self.client.post(
            reverse("auth-password-reset"), {"email": "reset-me@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["reset-me@example.com"])
        self.assertIn("/reset-password?uid=", sent.body)
        self.assertIn("token=", sent.body)

    def test_request_for_unknown_email_returns_200_but_sends_nothing(self):
        # Enumeration protection: the response must not reveal whether the
        # account exists.
        response = self.client.post(
            reverse("auth-password-reset"), {"email": "nobody@example.com"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_confirm_with_a_valid_token_actually_changes_the_password(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)

        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": token, "new_password": "BrandNewPassword456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        login_response = self.client.post(
            reverse("auth-login"),
            {"email": "reset-me@example.com", "password": "BrandNewPassword456"},
            format="json",
        )
        self.assertEqual(login_response.status_code, status.HTTP_200_OK)

    def test_confirm_with_an_invalid_token_is_rejected(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))

        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": "not-a-real-token", "new_password": "BrandNewPassword456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPassword123"))  # unchanged

    def test_confirm_with_a_garbage_uid_is_rejected_not_500(self):
        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": "not-valid-base64!!!", "token": "whatever", "new_password": "BrandNewPassword456"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_a_token_cannot_be_reused_after_the_password_has_already_changed(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": token, "new_password": "FirstNewPassword456"},
            format="json",
        )

        response = self.client.post(
            reverse("auth-password-reset-confirm"),
            {"uid": uid, "token": token, "new_password": "SecondNewPassword789"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class MeUpdateTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="me@example.com", password="pw12345678", role="SELLER")
        self.client.force_authenticate(user=self.user)

    def test_patch_updates_phone_and_profile(self):
        response = self.client.patch(
            "/api/auth/me/",
            {"phone": "+919800000000", "profile": {"display_name": "Ramesh Farms", "preferred_language": "hi"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["phone"], "+919800000000")
        self.assertEqual(response.data["profile"]["display_name"], "Ramesh Farms")
        self.assertEqual(response.data["profile"]["preferred_language"], "hi")

    def test_patch_creates_a_missing_profile(self):
        response = self.client.patch(
            "/api/auth/me/", {"profile": {"location_lat": 26.9, "location_lng": 75.8}}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["location_lat"], 26.9)

    def test_role_and_email_cannot_be_changed(self):
        self.client.patch("/api/auth/me/", {"role": "ADMIN", "email": "evil@example.com"}, format="json")

        self.user.refresh_from_db()
        self.assertEqual(self.user.role, "SELLER")
        self.assertEqual(self.user.email, "me@example.com")


class RefreshCookieTest(APITestCase):
    """httpOnly refresh cookie for the web app; body tokens for the Android app."""

    def setUp(self):
        self.user = User.objects.create_user(email="cookie@example.com", password="pw12345678", role="BUYER")
        self.credentials = {"email": "cookie@example.com", "password": "pw12345678"}

    def _login(self, cookie_mode=True):
        headers = {"HTTP_X_AUTH_MODE": "cookie"} if cookie_mode else {}
        return self.client.post("/api/auth/login/", self.credentials, format="json", **headers)

    def test_cookie_mode_login_sets_an_httponly_cookie_and_hides_the_refresh_token(self):
        response = self._login()

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        cookie = response.cookies["msme_refresh"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/auth/")
        self.assertEqual(cookie["samesite"], "Lax")

    def test_body_mode_login_is_unchanged_for_the_app(self):
        response = self._login(cookie_mode=False)

        self.assertIn("refresh", response.data)
        self.assertNotIn("msme_refresh", response.cookies)

    def test_refresh_from_the_cookie_rotates_it(self):
        old = self._login().cookies["msme_refresh"].value

        response = self.client.post("/api/auth/refresh/", {}, format="json", HTTP_X_AUTH_MODE="cookie")

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertNotEqual(response.cookies["msme_refresh"].value, old)

    def test_a_rotated_out_refresh_token_cannot_be_replayed(self):
        old = self._login(cookie_mode=False).data["refresh"]
        self.client.post("/api/auth/refresh/", {"refresh": old}, format="json")

        replay = self.client.post("/api/auth/refresh/", {"refresh": old}, format="json")

        self.assertEqual(replay.status_code, 401)

    def test_refresh_without_any_token_is_401(self):
        response = self.client.post("/api/auth/refresh/", {}, format="json", HTTP_X_AUTH_MODE="cookie")
        self.assertEqual(response.status_code, 401)

    def test_logout_revokes_the_refresh_token_and_clears_the_cookie(self):
        self._login()

        response = self.client.post("/api/auth/logout/", {}, format="json")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies["msme_refresh"].value, "")
        refresh = self.client.post("/api/auth/refresh/", {}, format="json", HTTP_X_AUTH_MODE="cookie")
        self.assertEqual(refresh.status_code, 401)

    def test_app_logout_with_a_body_token_revokes_it(self):
        refresh = self._login(cookie_mode=False).data["refresh"]

        self.client.post("/api/auth/logout/", {"refresh": refresh}, format="json")

        self.assertEqual(self.client.post("/api/auth/refresh/", {"refresh": refresh}, format="json").status_code, 401)
