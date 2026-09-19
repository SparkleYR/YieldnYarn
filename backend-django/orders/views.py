import httpx
from django.conf import settings
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from catalog.models import Listing
from core.permissions import IsBidPartyOrAdmin, IsOwnerOrAdmin
from notifications.models import Notification

from .models import Bid, Order, Requirement
from .serializers import BidSerializer, OrderSerializer, RequirementSerializer


class RequirementViewSet(viewsets.ModelViewSet):
    """
    /api/orders/requirements/            (list, create)
    /api/orders/requirements/{id}/       (retrieve, update, destroy)
    /api/orders/requirements/{id}/match/ (POST -> triggers FastAPI matching/allocation)
    """

    serializer_class = RequirementSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    filterset_fields = ["vertical", "status"]
    search_fields = ["commodity"]

    def get_queryset(self):
        user = self.request.user
        qs = Requirement.objects.select_related("buyer", "vertical").all()
        if user.is_superuser or user.role == "ADMIN":
            return qs
        if user.role == "BUYER":
            return qs.filter(buyer=user)
        # Sellers/verifiers can browse open requirements (demand signals)
        return qs.filter(status=Requirement.Status.OPEN)

    @action(detail=True, methods=["post"], url_path="match")
    def trigger_match(self, request, pk=None):
        """Proxies to FastAPI's POST /compute/matching/allocate.

        Nothing else in this codebase ever calls the matching engine — the
        buyer requirements UI's own copy ("the matching engine finds
        sellers for you") was previously just aspirational text. A
        requirement staying unmatched (no listings yet, or none within
        price/grade/radius) is a normal, expected outcome, not an error —
        this always returns 200 with `matched: true/false`, mirroring how
        `catalog/views.py:trigger_grading` proxies FastAPI's grading call.
        """
        requirement = self.get_object()
        try:
            response = httpx.post(
                f"{settings.FASTAPI_BASE_URL}/compute/matching/allocate",
                json={"requirement_id": requirement.id},
                timeout=30.0,
            )
        except httpx.HTTPError as exc:
            return Response(
                {"matched": False, "detail": f"Could not reach matching service: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if response.status_code == 409:
            return Response({"matched": False, "detail": "No matching listings available yet."})

        if response.status_code >= 400:
            return Response(
                {
                    "matched": False,
                    "detail": "Matching service rejected the request.",
                    "upstream_status": response.status_code,
                    "upstream_body": response.text,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        body = response.json()
        requirement.refresh_from_db()
        seller_count = len({m["listing_id"] for m in body.get("allocations", [])})
        Notification.objects.create(
            user_id=requirement.buyer_id,
            type=Notification.Type.ORDER_MATCHED,
            title="Requirement matched" if body.get("fully_fulfilled") else "Requirement partially matched",
            message=(
                f"Your {requirement.commodity} requirement was "
                f"{'fully' if body.get('fully_fulfilled') else 'partially'} matched across "
                f"{seller_count} seller{'' if seller_count == 1 else 's'}. Order #{body['order_id']} created."
            ),
            related_object_type="order",
            related_object_id=body["order_id"],
        )
        return Response({"matched": True, "requirement_status": requirement.status, **body})


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    """
    /api/orders/orders/       (list)
    /api/orders/orders/{id}/  (retrieve)
    """

    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    filterset_fields = ["status"]

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.select_related("buyer", "requirement").prefetch_related(
            "allocations__listing__seller__profile"
        )
        if user.is_superuser or user.role == "ADMIN":
            return qs
        if user.role == "BUYER":
            return qs.filter(buyer=user)
        if user.role == "SELLER":
            return qs.filter(allocations__listing__seller=user).distinct()
        return qs.none()


class BidViewSet(viewsets.ModelViewSet):
    """
    /api/orders/bids/       (list, create)
    /api/orders/bids/{id}/  (retrieve, update [accept/reject/counter])
    """

    serializer_class = BidSerializer
    permission_classes = [permissions.IsAuthenticated, IsBidPartyOrAdmin]
    filterset_fields = ["listing", "status"]

    def get_queryset(self):
        user = self.request.user
        qs = Bid.objects.select_related("listing", "buyer").all()
        if user.is_superuser or user.role == "ADMIN":
            return qs
        if user.role == "BUYER":
            return qs.filter(buyer=user)
        if user.role == "SELLER":
            return qs.filter(listing__seller=user)
        return qs.none()
