from rest_framework import serializers

from .models import DeviceToken, Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "user",
            "type",
            "title",
            "message",
            "related_object_type",
            "related_object_id",
            "is_read",
            "fcm_sent",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "fcm_sent",
            "created_at",
        ]


class DeviceTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)
    platform = serializers.ChoiceField(
        choices=DeviceToken.Platform.choices, default=DeviceToken.Platform.ANDROID
    )


class DeviceTokenUnregisterSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)
