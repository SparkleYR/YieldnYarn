from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AdminStatsView,
    AdminUserViewSet,
    LoginView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)

router = DefaultRouter()
router.register("users", AdminUserViewSet, basename="admin-user")

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("admin/stats/", AdminStatsView.as_view(), name="auth-admin-stats"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("", include(router.urls)),
]
