"""
URL configuration for the MSME Multi-Vertical Commodity Marketplace.

See implementation_plan.md §4.2 for the full endpoint list.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/config/", include("config.urls")),
    path("api/catalog/", include("catalog.urls")),
    path("api/verification/", include("catalog.verification_urls")),
    path("api/orders/", include("orders.urls")),
    path("api/disputes/", include("disputes.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/reputation/", include("reputation.urls")),
    path("api/pricing/", include("pricing.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="api-schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="api-schema"), name="api-docs"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
