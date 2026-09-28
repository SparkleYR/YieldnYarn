from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .fcm import dispatch_notification
from .models import DeviceToken, Notification

User = get_user_model()


class NotificationListViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="user@example.com", password="pw12345", role="BUYER")
        self.other = User.objects.create_user(email="other@example.com", password="pw12345", role="BUYER")

    def test_only_returns_own_notifications(self):
        Notification.objects.create(user=self.user, type="SYSTEM", title="Mine")
        Notification.objects.create(user=self.other, type="SYSTEM", title="Not mine")
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Mine")

    def test_unauthenticated_cannot_list(self):
        response = self.client.get("/api/notifications/")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_filters_by_is_read(self):
        Notification.objects.create(user=self.user, type="SYSTEM", title="Read", is_read=True)
        Notification.objects.create(user=self.user, type="SYSTEM", title="Unread", is_read=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/notifications/", {"is_read": "false"})

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Unread")


class NotificationReadViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="user@example.com", password="pw12345", role="BUYER")
        self.other = User.objects.create_user(email="other@example.com", password="pw12345", role="BUYER")

    def test_marks_own_notification_as_read(self):
        notification = Notification.objects.create(user=self.user, type="SYSTEM", title="Hi", is_read=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(f"/api/notifications/{notification.id}/read/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)

    def test_cannot_mark_another_users_notification(self):
        notification = Notification.objects.create(user=self.other, type="SYSTEM", title="Hi", is_read=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post(f"/api/notifications/{notification.id}/read/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        notification.refresh_from_db()
        self.assertFalse(notification.is_read)


class NotificationReadAllViewTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="user@example.com", password="pw12345", role="BUYER")
        self.other = User.objects.create_user(email="other@example.com", password="pw12345", role="BUYER")

    def test_marks_all_own_unread_as_read(self):
        Notification.objects.create(user=self.user, type="SYSTEM", title="A", is_read=False)
        Notification.objects.create(user=self.user, type="SYSTEM", title="B", is_read=False)
        Notification.objects.create(user=self.user, type="SYSTEM", title="C", is_read=True)
        Notification.objects.create(user=self.other, type="SYSTEM", title="Not mine", is_read=False)
        self.client.force_authenticate(user=self.user)

        response = self.client.post("/api/notifications/read-all/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["marked_read"], 2)
        self.assertEqual(Notification.objects.filter(user=self.user, is_read=False).count(), 0)
        # Other user's unread notification is untouched.
        self.assertTrue(Notification.objects.get(user=self.other).is_read is False)


class DeviceRegistrationTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="phone@example.com", password="pw12345", role="SELLER")
        self.other = User.objects.create_user(email="phone2@example.com", password="pw12345", role="SELLER")

    def test_register_creates_a_token_for_the_caller(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            "/api/notifications/devices/", {"token": "tok-1", "platform": "ANDROID"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DeviceToken.objects.get(token="tok-1").user_id, self.user.id)

    def test_re_registering_is_idempotent(self):
        self.client.force_authenticate(user=self.user)
        self.client.post("/api/notifications/devices/", {"token": "tok-1"}, format="json")

        response = self.client.post("/api/notifications/devices/", {"token": "tok-1"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DeviceToken.objects.count(), 1)

    def test_token_moves_to_the_account_that_registers_it_last(self):
        DeviceToken.objects.create(user=self.other, token="shared-phone")
        self.client.force_authenticate(user=self.user)

        self.client.post("/api/notifications/devices/", {"token": "shared-phone"}, format="json")

        self.assertEqual(DeviceToken.objects.get(token="shared-phone").user_id, self.user.id)

    def test_unregister_only_removes_the_callers_token(self):
        DeviceToken.objects.create(user=self.user, token="mine")
        DeviceToken.objects.create(user=self.other, token="theirs")
        self.client.force_authenticate(user=self.user)

        mine = self.client.post("/api/notifications/devices/unregister/", {"token": "mine"}, format="json")
        theirs = self.client.post("/api/notifications/devices/unregister/", {"token": "theirs"}, format="json")

        self.assertEqual(mine.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(theirs.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(list(DeviceToken.objects.values_list("token", flat=True)), ["theirs"])

    def test_requires_authentication(self):
        response = self.client.post("/api/notifications/devices/", {"token": "x"}, format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class UnregisteredError(Exception):
    """Stands in for firebase_admin.messaging.UnregisteredError (matched by name)."""


def _fake_messaging(responses):
    messaging = MagicMock()
    messaging.send_each_for_multicast.return_value = SimpleNamespace(
        responses=responses, success_count=sum(1 for r in responses if r.success)
    )
    return messaging


class FcmDispatchTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="push@example.com", password="pw12345", role="SELLER")
        self.notification = Notification.objects.create(
            user=self.user, type="BID_RECEIVED", title="New bid", message="₹2000 for 5 quintal",
            related_object_type="bid", related_object_id=7,
        )

    def test_no_devices_means_no_send(self):
        with patch("notifications.fcm.get_messaging") as get_messaging:
            self.assertEqual(dispatch_notification(self.notification.id), 0)
        get_messaging.assert_not_called()

    def test_not_configured_is_a_quiet_no_op(self):
        DeviceToken.objects.create(user=self.user, token="tok")
        with patch("notifications.fcm.get_messaging", return_value=None):
            self.assertEqual(dispatch_notification(self.notification.id), 0)
        self.notification.refresh_from_db()
        self.assertFalse(self.notification.fcm_sent)

    def test_sends_to_every_device_and_marks_sent(self):
        DeviceToken.objects.create(user=self.user, token="phone")
        DeviceToken.objects.create(user=self.user, token="tablet")
        messaging = _fake_messaging([SimpleNamespace(success=True, exception=None)] * 2)

        with patch("notifications.fcm.get_messaging", return_value=messaging):
            delivered = dispatch_notification(self.notification.id)

        self.assertEqual(delivered, 2)
        kwargs = messaging.MulticastMessage.call_args.kwargs
        self.assertCountEqual(kwargs["tokens"], ["phone", "tablet"])
        self.assertEqual(kwargs["data"]["related_object_id"], "7")
        self.assertEqual(kwargs["data"]["type"], "BID_RECEIVED")
        messaging.Notification.assert_called_once_with(title="New bid", body="₹2000 for 5 quintal")
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.fcm_sent)

    def test_dead_tokens_are_pruned(self):
        DeviceToken.objects.create(user=self.user, token="alive")
        DeviceToken.objects.create(user=self.user, token="uninstalled")
        tokens = list(DeviceToken.objects.filter(user=self.user).values_list("token", flat=True))
        responses = [
            SimpleNamespace(success=True, exception=None)
            if token == "alive"
            else SimpleNamespace(success=False, exception=UnregisteredError())
            for token in tokens
        ]

        with patch("notifications.fcm.get_messaging", return_value=_fake_messaging(responses)):
            dispatch_notification(self.notification.id)

        self.assertEqual(list(DeviceToken.objects.values_list("token", flat=True)), ["alive"])

    def test_transient_failures_keep_the_token_and_leave_fcm_sent_false(self):
        DeviceToken.objects.create(user=self.user, token="flaky")
        responses = [SimpleNamespace(success=False, exception=RuntimeError("503"))]

        with patch("notifications.fcm.get_messaging", return_value=_fake_messaging(responses)):
            dispatch_notification(self.notification.id)

        self.assertTrue(DeviceToken.objects.filter(token="flaky").exists())
        self.notification.refresh_from_db()
        self.assertFalse(self.notification.fcm_sent)

    def test_creating_a_notification_dispatches_after_commit(self):
        DeviceToken.objects.create(user=self.user, token="phone")
        with patch("notifications.signals.dispatch_notification") as dispatch:
            with self.captureOnCommitCallbacks(execute=True):
                created = Notification.objects.create(user=self.user, type="SYSTEM", title="Hi")
        dispatch.assert_called_once_with(created.id)

    def test_a_crashing_dispatch_does_not_break_notification_creation(self):
        with patch("notifications.signals.dispatch_notification", side_effect=RuntimeError("boom")):
            with self.captureOnCommitCallbacks(execute=True):
                Notification.objects.create(user=self.user, type="SYSTEM", title="Still saved")
        self.assertTrue(Notification.objects.filter(title="Still saved").exists())
