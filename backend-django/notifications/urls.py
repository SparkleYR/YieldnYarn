from django.urls import path

from .views import (
    DeviceRegisterView,
    DeviceUnregisterView,
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("read-all/", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("devices/", DeviceRegisterView.as_view(), name="device-register"),
    path("devices/unregister/", DeviceUnregisterView.as_view(), name="device-unregister"),
    path("<int:pk>/read/", NotificationReadView.as_view(), name="notification-read"),
]
