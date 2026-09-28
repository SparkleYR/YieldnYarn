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
    proposed_by = serializers.PrimaryKeyRelatedField(read_only=True)
    # Denormalized for the seller app's bid-management screen and the buyer's
    # offers list, so neither needs a per-bid listing/user fetch.
    commodity_name = serializers.CharField(source="listing.commodity_name", read_only=True)
    unit = serializers.CharField(source="listing.unit", read_only=True)
    buyer_name = serializers.SerializerMethodField()
    # "BUYER"/"SELLER" while PENDING (whose move it is), None once settled.
    awaiting_response_from = serializers.SerializerMethodField()

    class Meta:
        model = Bid
        fields = [
            "id",
            "listing",
            "commodity_name",
            "unit",
            "buyer",
            "buyer_name",
            "proposed_by",
            "offered_price",
            "offered_quantity",
            "status",
            "parent_bid",
            "message",
            "awaiting_response_from",
            "created_at",
        ]
        read_only_fields = ["id", "buyer", "proposed_by", "parent_bid", "created_at"]

    def get_buyer_name(self, bid):
        return _display_name(bid.buyer)

    def get_awaiting_response_from(self, bid):
        if bid.status != Bid.Status.PENDING:
            return None
        return "SELLER" if bid.responder_id == bid.listing.seller_id else "BUYER"

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["buyer"] = user
        validated_data["proposed_by"] = user
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
        user = self.context["request"].user
        if self.instance is None:
            listing = attrs.get("listing")
            if listing is not None and listing.seller_id == user.id:
                raise serializers.ValidationError("You cannot bid on your own listing.")
            if listing is not None and listing.status != Listing.Status.ACTIVE:
                raise serializers.ValidationError("Bids can only be placed on active listings.")
            return attrs

        # ACCEPTED/REJECTED belong to whoever did *not* make the offer — the
        # listing's seller for an ordinary bid, the buyer for a seller's
        # counter-offer. IsBidPartyOrAdmin (core/permissions.py) grants both
        # parties object-level access to a bid they're party to, but doesn't
        # distinguish *which* status transitions each may make, so that has
        # to be enforced here instead.
        new_status = attrs.get("status")
        if new_status in (Bid.Status.ACCEPTED, Bid.Status.REJECTED):
            is_admin = user.is_superuser or user.role == "ADMIN"
            if not (is_admin or self.instance.responder_id == user.id):
                if self.instance.proposer_id == self.instance.buyer_id:
                    raise PermissionDenied("Only the listing's seller can accept or reject a bid.")
                raise PermissionDenied("Only the buyer can accept or reject a seller's counter-offer.")
            if (
                new_status == Bid.Status.ACCEPTED
                and self.instance.status != Bid.Status.ACCEPTED
                and self.instance.offered_quantity > self.instance.listing.quantity
            ):
                raise serializers.ValidationError(
                    "The listing no longer has enough quantity left to accept this offer."
                )
        return attrs

    def update(self, instance, validated_data):
        new_status = validated_data.get("status")
        previous_status = instance.status
        bid = super().update(instance, validated_data)
        # Whoever made the offer is the one waiting to hear back about it.
        proposer_id = bid.proposer_id
        is_counter = proposer_id != bid.buyer_id
        if new_status == Bid.Status.ACCEPTED and previous_status != Bid.Status.ACCEPTED:
            order = self._create_order_for_accepted_bid(bid)
            Notification.objects.create(
                user_id=proposer_id,
                type=Notification.Type.ORDER_MATCHED,
                title="Counter-offer accepted" if is_counter else "Bid accepted",
                message=(
                    f"Your {'counter-offer' if is_counter else 'bid'} on {bid.listing.commodity_name} "
                    f"was accepted. Order #{order.id} created."
                ),
                related_object_type="order",
                related_object_id=order.id,
            )
        elif new_status == Bid.Status.REJECTED and previous_status != Bid.Status.REJECTED:
            Notification.objects.create(
                user_id=proposer_id,
                type=Notification.Type.SYSTEM,
                title="Counter-offer rejected" if is_counter else "Bid rejected",
                message=(
                    f"Your counter-offer on {bid.listing.commodity_name} was rejected by the buyer."
                    if is_counter
                    else f"Your bid on {bid.listing.commodity_name} was rejected by the seller."
                ),
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


class CounterBidSerializer(serializers.Serializer):
    """Body of POST /api/orders/bids/{id}/counter/."""

    offered_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    # Defaults to the quantity of the offer being countered.
    offered_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False
    )
    message = serializers.CharField(required=False, allow_blank=True, default="")
