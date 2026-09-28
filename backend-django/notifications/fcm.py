"""Firebase Cloud Messaging dispatch for `Notification` rows (§4.3).

Configured by pointing FIREBASE_CREDENTIALS_FILE at a Firebase service-account
JSON. Without it (the default in local dev and CI), dispatch is a logged
no-op — the in-app notification list still works, there's just no push.
`firebase-admin` is imported lazily so the rest of the backend never depends
on it being importable.
"""

import logging
import threading

from django.conf import settings

logger = logging.getLogger(__name__)

# Error types Firebase returns for a token that will never work again (app
# uninstalled, token rotated, token from another Firebase project). Matched by
# class name so this module doesn't need firebase_admin imported to check.
_DEAD_TOKEN_ERRORS = {"UnregisteredError", "SenderIdMismatchError"}

_app_lock = threading.Lock()
_app = None
_app_init_failed = False


def get_messaging():
    """Return the `firebase_admin.messaging` module, or None if FCM isn't
    configured/available. Initializes the Firebase app once per process."""
    global _app, _app_init_failed

    credentials_file = getattr(settings, "FIREBASE_CREDENTIALS_FILE", "")
    if not credentials_file or _app_init_failed:
        return None

    with _app_lock:
        if _app is None:
            try:
                import firebase_admin
                from firebase_admin import credentials

                _app = firebase_admin.initialize_app(
                    credentials.Certificate(credentials_file)
                )
            except Exception:
                _app_init_failed = True
                logger.exception(
                    "FCM disabled: could not initialize Firebase from %s", credentials_file
                )
                return None

    from firebase_admin import messaging

    return messaging


def dispatch_notification(notification_id):
    """Push one Notification to every registered device of its user.

    Returns the number of devices it was delivered to. Tokens Firebase
    reports as permanently dead are deleted; `fcm_sent` is set if at least
    one device accepted the message.
    """
    from .models import DeviceToken, Notification

    notification = Notification.objects.filter(pk=notification_id).first()
    if notification is None:
        return 0

    tokens = list(
        DeviceToken.objects.filter(user_id=notification.user_id).values_list("token", flat=True)
    )
    if not tokens:
        return 0

    messaging = get_messaging()
    if messaging is None:
        logger.debug(
            "FCM not configured; skipping push for notification %s (%d device(s))",
            notification.id,
            len(tokens),
        )
        return 0

    message = messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(
            title=notification.title, body=notification.message
        ),
        # FCM data payload values must be strings.
        data={
            "notification_id": str(notification.id),
            "type": notification.type,
            "related_object_type": notification.related_object_type,
            "related_object_id": (
                str(notification.related_object_id)
                if notification.related_object_id is not None
                else ""
            ),
        },
    )

    try:
        batch = messaging.send_each_for_multicast(message)
    except Exception:
        logger.exception("FCM send failed for notification %s", notification.id)
        return 0

    dead_tokens = [
        token
        for token, response in zip(tokens, batch.responses)
        if not response.success
        and type(response.exception).__name__ in _DEAD_TOKEN_ERRORS
    ]
    if dead_tokens:
        DeviceToken.objects.filter(token__in=dead_tokens).delete()

    if batch.success_count:
        # .update() rather than .save() so this doesn't re-fire post_save.
        Notification.objects.filter(pk=notification.id).update(fcm_sent=True)
    return batch.success_count
