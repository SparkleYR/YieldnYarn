from django.contrib import admin

from .models import DeviceToken, Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "type", "title", "is_read", "fcm_sent", "created_at"]
    list_filter = ["type", "is_read", "fcm_sent"]
    search_fields = ["user__email", "title"]


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "platform", "created_at", "last_seen_at"]
    list_filter = ["platform"]
    search_fields = ["user__email"]
