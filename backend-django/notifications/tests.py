from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Notification

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
