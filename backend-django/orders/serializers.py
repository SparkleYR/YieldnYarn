from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from catalog.models import Listing
from catalog.serializers import _display_name
from notifications.models import Notification

from .models import Bid, Order, OrderAllocation, Requirement


class RequirementSerializer(serializers.ModelSerializer):
    buyer = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Requirement
        fields = [
            "id",
            "buyer",
            "vertical",
            "commodity",
            "quantity",
            "min_grade",
            "max_price",
            "budget",
            "region",
            "region_lat",
            "region_lng",
            "search_radius_km",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "buyer", "status", "created_at"]

    def create(self, validated_data):
        validated_data["buyer"] = self.context["request"].user
        return super().create(validated_data)


class OrderAllocationSerializer(serializers.ModelSerializer):
    # Denormalized read-only fields so the order history UI doesn't need a
    # separate per-listing fetch just to show what/who was in the allocation.
    commodity_name = serializers.CharField(source="listing.commodity_name", read_only=True)
    unit = serializers.CharField(source="listing.unit", read_only=True)
    seller_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderAllocation
        fields = [
            "id",
            "order",
            "listing",
            "commodity_name",
            "unit",
            "seller_name",
            "allocated_quantity",
            "unit_price",
            "status",
        ]
        read_only_fields = ["id"]

    def get_seller_name(self, allocation):
        return _display_name(allocation.listing.seller)


class OrderSerializer(serializers.ModelSerializer):
    buyer = serializers.PrimaryKeyRelatedField(read_only=True)
    allocations = OrderAllocationSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "requirement",
            "buyer",
            "status",
            "total_price",
            "created_at",
            "allocations",
        ]
        read_only_fields = ["id", "buyer", "created_at", "allocations"]

    def create(self, validated_data):
        validated_data["buyer"] = self.context["request"].user
        return super().create(validated_data)


class BidSerializer(serializers.ModelSerializer):
    buyer = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Bid
        fields = [
            "id",
            "listing",
            "buyer",
            "offered_price",
            "offered_quantity",
            "status",
            "parent_bid",
            "message",
            "created_at",
        ]
        read_only_fields = ["id", "buyer", "created_at"]

    def create(self, validated_data):
        validated_data["buyer"] = self.context["request"].user
        bid = super().create(validated_data)
        Notification.objects.create(
            user_id=bid.listing.seller_id,
            type=Notification.Type.BID_RECEIVED,
            title="New bid received",
            message=(
                f"{_display_name(bid.buyer)} offered ₹{bid.offered_price} for "
                f"{bid.offered_quantity} {bid.listing.unit} of {bid.listing.commodity_name}."
            ),
            related_object_type="bid",
            related_object_id=bid.id,
        )
        return bid

    def validate(self, attrs):
        # ACCEPTED/REJECTED are the listing owner's call, not the bidding
        # buyer's — IsBidPartyOrAdmin (core/permissions.py) grants both
        # parties object-level read/update access to a bid they're party to,
        # but it doesn't distinguish *which* status transitions each party
        # may make, so that has to be enforced here instead.
        new_status = attrs.get("status")
        if self.instance is not None and new_status in (Bid.Status.ACCEPTED, Bid.Status.REJECTED):
            user = self.context["request"].user
            if not (
                user.is_superuser
                or user.role == "ADMIN"
                or self.instance.listing.seller_id == user.id
            ):
                raise PermissionDenied("Only the listing's seller can accept or reject a bid.")
        return attrs

    def update(self, instance, validated_data):
        new_status = validated_data.get("status")
        previous_status = instance.status
        bid = super().update(instance, validated_data)
        if new_status == Bid.Status.ACCEPTED and previous_status != Bid.Status.ACCEPTED:
            order = self._create_order_for_accepted_bid(bid)
            Notification.objects.create(
                user_id=bid.buyer_id,
                type=Notification.Type.ORDER_MATCHED,
                title="Bid accepted",
                message=f"Your bid on {bid.listing.commodity_name} was accepted. Order #{order.id} created.",
                related_object_type="order",
                related_object_id=order.id,
            )
        elif new_status == Bid.Status.REJECTED and previous_status != Bid.Status.REJECTED:
            Notification.objects.create(
                user_id=bid.buyer_id,
                type=Notification.Type.SYSTEM,
                title="Bid rejected",
                message=f"Your bid on {bid.listing.commodity_name} was rejected by the seller.",
                related_object_type="bid",
                related_object_id=bid.id,
            )
        return bid

    def _create_order_for_accepted_bid(self, bid):
        """Accepting a bid is a real transaction, not just a status flip —
        it needs to produce the Order/OrderAllocation a buyer will actually
        see in their order history, and reflect the sale against the
        listing's remaining quantity (marking it SOLD once exhausted)."""
        order = Order.objects.create(
            buyer=bid.buyer,
            status=Order.Status.CONFIRMED,
            total_price=bid.offered_price * bid.offered_quantity,
        )
        OrderAllocation.objects.create(
            order=order,
            listing=bid.listing,
            allocated_quantity=bid.offered_quantity,
            unit_price=bid.offered_price,
            status=OrderAllocation.Status.CONFIRMED,
        )
        listing = bid.listing
        remaining = listing.quantity - bid.offered_quantity
        listing.quantity = max(remaining, 0)
        if remaining <= 0:
            listing.status = Listing.Status.SOLD
        listing.save(update_fields=["quantity", "status"])
        return order
