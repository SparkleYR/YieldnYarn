import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db.models import Sum
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, permissions, serializers, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from catalog.models import Listing
from core.permissions import IsAdmin
from orders.models import Order

from .models import User
from .serializers import (
    AdminUserSerializer,
    MeUpdateSerializer,
    MyTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)


class RegisterView(generics.CreateAPIView):
    """POST /api/auth/register/"""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]


def _cookie_mode(request) -> bool:
    """The web app opts in with `X-Auth-Mode: cookie`; everyone else (the
    Android app, scripts) keeps getting the refresh token in the body."""
    return request.headers.get("X-Auth-Mode", "").lower() == "cookie"


def _set_refresh_cookie(response, refresh: str):
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.REFRESH_COOKIE_PATH,
        secure=settings.REFRESH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def _clear_refresh_cookie(response):
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def _move_refresh_to_cookie(request, response):
    refresh = response.data.get("refresh") if isinstance(response.data, dict) else None
    if response.status_code == 200 and refresh and _cookie_mode(request):
        _set_refresh_cookie(response, refresh)
        del response.data["refresh"]
    return response


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ -> JWT access + refresh tokens.

    With `X-Auth-Mode: cookie` the refresh token is set as an httpOnly cookie
    instead of returned in the body.
    """

    serializer_class = MyTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        return _move_refresh_to_cookie(request, super().post(request, *args, **kwargs))


class CookieTokenRefreshView(TokenRefreshView):
    """POST /api/auth/refresh/ — body `{refresh}` (app) or the refresh cookie (web).

    Refresh tokens rotate and the old one is blacklisted, so a leaked refresh
    token stops working the next time the real client refreshes.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        data = request.data
        if not data.get("refresh"):
            cookie = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
            if cookie:
                data = {"refresh": cookie}
        if not data.get("refresh"):
            # Not signed in (no cookie, no body token) — 401 like any other
            # dead session, rather than a 400 about a missing field.
            return Response({"detail": "No refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken) as exc:
            response = Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
            if _cookie_mode(request):
                _clear_refresh_cookie(response)
            return response
        response = Response(serializer.validated_data, status=status.HTTP_200_OK)
        return _move_refresh_to_cookie(request, response)


@extend_schema(
    request=inline_serializer("LogoutRequest", {"refresh": serializers.CharField(required=False)}),
    responses={204: OpenApiResponse(description="Logged out")},
)
class LogoutView(APIView):
    """POST /api/auth/logout/ — revoke the refresh token (body or cookie) and
    clear the cookie. Always 204: logging out twice isn't an error."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh = request.data.get("refresh") or request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                pass  # already expired/blacklisted/garbage: nothing to revoke
        response = Response(status=status.HTTP_204_NO_CONTENT)
        _clear_refresh_cookie(response)
        return response


@extend_schema(request=MeUpdateSerializer, responses=UserSerializer)
class MeView(APIView):
    """GET /api/auth/me/, PATCH /api/auth/me/ (phone + profile fields)"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = MeUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Re-read so a freshly created profile is reflected in the response.
        user = User.objects.select_related("profile").get(pk=user.pk)
        return Response(UserSerializer(user).data)


_Detail = inline_serializer("Detail", {"detail": serializers.CharField()})


@extend_schema(request=PasswordResetRequestSerializer, responses=_Detail)
class PasswordResetRequestView(APIView):
    """POST /api/auth/password-reset/  {email}

    Always returns 200 with the same generic message whether or not the
    email belongs to a real account — confirming/denying an email's
    existence here is a real account-enumeration vector, not a detail worth
    trading away for a slightly more specific response. Uses Django's own
    `default_token_generator` (the same primitive `PasswordResetView` uses
    for the stock HTML flow), just surfaced as a JSON API for this SPA.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            try:
                send_mail(
                    subject="Reset your MSME Marketplace password",
                    message=(
                        f"Someone requested a password reset for this account.\n\n"
                        f"Reset your password: {reset_url}\n\n"
                        f"If you didn't request this, you can ignore this email."
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                )
            except Exception:
                # Best-effort: a mail-sending failure shouldn't leak whether
                # the account exists, and shouldn't 500 the request either.
                logger.exception("Failed to send password reset email to user_id=%s", user.id)

        return Response(
            {"detail": "If an account with that email exists, a reset link has been sent."},
            status=status.HTTP_200_OK,
        )


@extend_schema(request=PasswordResetConfirmSerializer, responses={200: _Detail, 400: _Detail})
class PasswordResetConfirmView(APIView):
    """POST /api/auth/password-reset/confirm/  {uid, token, new_password}"""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user_id = urlsafe_base64_decode(data["uid"]).decode()
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, data["token"]):
            return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        return Response({"detail": "Password has been reset."})


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    /api/auth/users/            (list, admin only)
    /api/auth/users/{id}/       (retrieve, partial_update — is_active only)

    Read/toggle only: email/phone/role edits and user creation/deletion are
    out of scope for this endpoint (registration owns creation).
    """

    queryset = User.objects.select_related("profile").all().order_by("-created_at")
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "patch", "head", "options"]
    filterset_fields = ["role", "is_active"]
    search_fields = ["email"]


# Orders whose money is actually committed — PENDING hasn't been confirmed
# yet and CANCELLED/DISPUTED shouldn't count as realized revenue.
REVENUE_STATUSES = (Order.Status.CONFIRMED, Order.Status.FULFILLED)


@extend_schema(
    responses=inline_serializer(
        "PlatformStats",
        {
            "total_listings": serializers.IntegerField(),
            "total_orders": serializers.IntegerField(),
            "total_users": serializers.IntegerField(),
            "revenue": serializers.DecimalField(max_digits=16, decimal_places=2),
            "revenue_delta_pct": serializers.FloatField(allow_null=True),
        },
    )
)
class AdminStatsView(APIView):
    """GET /api/auth/admin/stats/  (Admin only)

    Platform-wide counters for the admin dashboard. `revenue_delta_pct` is a
    real month-over-month comparison of REVENUE_STATUSES orders' total_price,
    not a placeholder — it's `None` (not 0) when last month had zero revenue
    to compare against, since a percentage change is undefined there.
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        now = timezone.now()
        this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        last_month_end = this_month_start - timedelta(seconds=1)
        last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        revenue_qs = Order.objects.filter(status__in=REVENUE_STATUSES)
        total_revenue = revenue_qs.aggregate(total=Sum("total_price"))["total"] or 0
        this_month_revenue = (
            revenue_qs.filter(created_at__gte=this_month_start).aggregate(total=Sum("total_price"))["total"] or 0
        )
        last_month_revenue = (
            revenue_qs.filter(
                created_at__gte=last_month_start, created_at__lte=last_month_end
            ).aggregate(total=Sum("total_price"))["total"]
            or 0
        )

        if last_month_revenue:
            revenue_delta_pct = round(
                float((this_month_revenue - last_month_revenue) / last_month_revenue) * 100, 1
            )
        else:
            revenue_delta_pct = None

        return Response(
            {
                "total_listings": Listing.objects.count(),
                "total_orders": Order.objects.count(),
                "total_users": User.objects.count(),
                "revenue": total_revenue,
                "revenue_delta_pct": revenue_delta_pct,
            }
        )
