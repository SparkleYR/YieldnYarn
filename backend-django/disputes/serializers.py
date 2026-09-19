from django.utils import timezone
from rest_framework import serializers

from catalog.serializers import _display_name
from notifications.models import Notification

from .models import Dispute


class DisputeSerializer(serializers.ModelSerializer):
    raised_by = serializers.PrimaryKeyRelatedField(read_only=True)
    raised_by_name = serializers.SerializerMethodField()
    against_name = serializers.SerializerMethodField()

    class Meta:
        model = Dispute
        fields = [
            "id",
            "order",
            "raised_by",
            "raised_by_name",
            "against",
            "against_name",
            "type",
            "status",
            "description",
            "evidence_refs",
            "resolution_notes",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["id", "raised_by", "created_at", "resolved_at"]

    def get_raised_by_name(self, dispute):
        return _display_name(dispute.raised_by)

    def get_against_name(self, dispute):
        return _display_name(dispute.against)

    def create(self, validated_data):
        validated_data["raised_by"] = self.context["request"].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        new_status = validated_data.get("status")
        previous_status = instance.status
        if new_status in (Dispute.Status.RESOLVED,) and previous_status != new_status:
            validated_data["resolved_at"] = timezone.now()
        dispute = super().update(instance, validated_data)
        if new_status and new_status != previous_status:
            self._notify_status_change(dispute)
        return dispute

    def _notify_status_change(self, dispute):
        message = f"Dispute on order #{dispute.order_id} is now {dispute.get_status_display()}."
        # Both parties care about a status change — raised_by and against —
        # not just whoever happened to make the request.
        for user_id in {dispute.raised_by_id, dispute.against_id}:
            Notification.objects.create(
                user_id=user_id,
                type=Notification.Type.DISPUTE_UPDATE,
                title="Dispute updated",
                message=message,
                related_object_type="dispute",
                related_object_id=dispute.id,
            )
