from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Type(models.TextChoices):
        GRADING_COMPLETE = "GRADING_COMPLETE", "Grading Complete"
        ORDER_MATCHED = "ORDER_MATCHED", "Order Matched"
        BID_RECEIVED = "BID_RECEIVED", "Bid Received"
        DISPUTE_UPDATE = "DISPUTE_UPDATE", "Dispute Update"
        SYSTEM = "SYSTEM", "System"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True, default="")
    related_object_type = models.CharField(max_length=50, blank=True, default="")
    related_object_id = models.PositiveIntegerField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    fcm_sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["user", "is_read"], name="idx_notif_user_unread"
            ),
        ]

    def __str__(self):
        return f"Notification<{self.user_id}:{self.type}>"


class DeviceToken(models.Model):
    """An FCM registration token for one of a user's devices.

    Registered by the seller Android app on login and whenever Firebase
    rotates the token (`POST /api/notifications/devices/`), and removed on
    logout. A token belongs to one device, so re-registering an existing
    token under a different account (shared phone, re-login) moves it rather
    than duplicating it — otherwise the previous account would keep getting
    this device's pushes.
    """

    class Platform(models.TextChoices):
        ANDROID = "ANDROID", "Android"
        IOS = "IOS", "iOS"
        WEB = "WEB", "Web"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="device_tokens",
    )
    token = models.CharField(max_length=512, unique=True)
    platform = models.CharField(
        max_length=10, choices=Platform.choices, default=Platform.ANDROID
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "device_tokens"

    def __str__(self):
        return f"DeviceToken<{self.user_id}:{self.platform}>"
