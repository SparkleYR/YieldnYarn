from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DeviceToken, Notification
from .serializers import (
    DeviceTokenSerializer,
    DeviceTokenUnregisterSerializer,
    NotificationSerializer,
)


class NotificationListView(generics.ListAPIView):
    """GET /api/notifications/  — the current user's notifications."""

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["type", "is_read"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI schema generation
            return Notification.objects.none()
        return Notification.objects.filter(user=self.request.user)


@extend_schema(request=None, responses=NotificationSerializer)
class NotificationReadView(APIView):
    """POST /api/notifications/{id}/read/"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
        except Notification.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notification).data)


@extend_schema(
    request=None,
    responses=inline_serializer("MarkedRead", {"marked_read": serializers.IntegerField()}),
)
class NotificationReadAllView(APIView):
    """POST /api/notifications/read-all/"""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({"marked_read": updated})


@extend_schema(request=DeviceTokenSerializer, responses=DeviceTokenSerializer)
class DeviceRegisterView(APIView):
    """POST /api/notifications/devices/  {token, platform}

    Upsert on the token itself: registering a token already held by another
    account moves it to the caller (same physical device, new login).
    201 when newly registered, 200 when it already existed.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeviceTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _device, created = DeviceToken.objects.update_or_create(
            token=serializer.validated_data["token"],
            defaults={
                "user": request.user,
                "platform": serializer.validated_data["platform"],
            },
        )
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


@extend_schema(request=DeviceTokenUnregisterSerializer, responses={204: OpenApiResponse(description="Unregistered")})
class DeviceUnregisterView(APIView):
    """POST /api/notifications/devices/unregister/  {token}

    Called on logout. Only removes the caller's own token; always 204 so it
    stays safe to retry.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeviceTokenUnregisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        DeviceToken.objects.filter(
            user=request.user, token=serializer.validated_data["token"]
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
