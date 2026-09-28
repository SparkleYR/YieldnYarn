from django.db.models import Q
from rest_framework import permissions, viewsets

from core.permissions import IsOwnerOrAdmin

from .models import Dispute
from .serializers import DisputeSerializer


class DisputeViewSet(viewsets.ModelViewSet):
    """
    /api/disputes/       (list, create)
    /api/disputes/{id}/  (retrieve, update)
    """

    serializer_class = DisputeSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    filterset_fields = ["status", "type", "order"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI schema generation
            return Dispute.objects.none()
        user = self.request.user
        qs = Dispute.objects.select_related("order", "raised_by", "against").all()
        if user.is_superuser or user.role == "ADMIN":
            return qs
        return qs.filter(Q(raised_by=user) | Q(against=user))
