import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .fcm import dispatch_notification
from .models import Notification

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Notification)
def dispatch_fcm_on_notification_create(sender, instance, created, **kwargs):
    """Per implementation_plan.md §4.3: when a Notification is created, push
    it via FCM to the user's registered devices (notifications/fcm.py).

    Deferred to on_commit so a push never announces something a rolled-back
    transaction didn't actually do (e.g. an order that failed to save), and
    guarded so a push failure can never break the request that created the
    notification.
    """
    if not created:
        return

    notification_id = instance.pk

    def _send():
        try:
            dispatch_notification(notification_id)
        except Exception:
            logger.exception("FCM dispatch crashed for notification %s", notification_id)

    transaction.on_commit(_send)
