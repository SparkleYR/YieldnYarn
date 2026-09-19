"""
Shared DRF permission classes implementing the RBAC rules described in
implementation_plan.md §4.3:

- Sellers can only CRUD their own listings.
- Buyers can only see ACTIVE listings.
- Admins see everything.
- Verifiers see only the verification queue.
"""

from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """Allows access only to ADMIN users (or superusers)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.role == "ADMIN")
        )


class IsSeller(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "SELLER")


class IsBuyer(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == "BUYER")


class IsVerifier(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.role == "VERIFIER"
        )


class IsVerifierOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.role in ("VERIFIER", "ADMIN") or user.is_superuser)
        )


class IsAdminOrReadOnly(permissions.BasePermission):
    """Anyone authenticated can read; only admins can write."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.is_superuser or user.role == "ADMIN"


class IsListingOwnerOrReadOnly(permissions.BasePermission):
    """
    Sellers may CRUD only their own listings. Admins may CRUD any listing.
    Everyone else (authenticated) gets read-only access, further filtered
    by queryset-level visibility rules (e.g. buyers only see ACTIVE).
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.role == "ADMIN":
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        return user.role == "SELLER" and obj.seller_id == user.id


class IsOwnerOrAdmin(permissions.BasePermission):
    """Generic: object must have a `.user`/`.buyer`/`.raised_by`/`.against`
    FK owner, or be admin.

    `against_id` matters for disputes specifically: `DisputeViewSet.get_queryset()`
    already scopes the list to `Q(raised_by=user) | Q(against=user))`, so the
    party a dispute was raised against needs to pass this same check on
    retrieve/update — otherwise they can see their dispute in the list but
    get a 403 opening it, which defeats the point of including them in the
    queryset at all.
    """

    owner_fields = ("user_id", "buyer_id", "raised_by_id", "against_id")

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.role == "ADMIN":
            return True
        for field in self.owner_fields:
            if hasattr(obj, field) and getattr(obj, field) == user.id:
                return True
        return False


class IsBidPartyOrAdmin(permissions.BasePermission):
    """
    A bid may be read/updated by: the buyer who placed it, the seller who
    owns the listing being bid on, or an admin.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.role == "ADMIN":
            return True
        if obj.buyer_id == user.id:
            return True
        return obj.listing.seller_id == user.id
