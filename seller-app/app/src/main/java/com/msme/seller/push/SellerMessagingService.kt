package com.msme.seller.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Receives pushes sent by backend-django/notifications/fcm.py. The payload's
 * data keys mirror the Notification row (type, related_object_type/id), which
 * is how a tap deep-links to the right listing or bid.
 */
@AndroidEntryPoint
class SellerMessagingService : FirebaseMessagingService() {
    @Inject lateinit var registrar: PushTokenRegistrar

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        scope.launch { registrar.register(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"].orEmpty()
        val id = message.data["notification_id"]?.toIntOrNull() ?: message.messageId.hashCode()
        NotificationChannels.show(
            this,
            id,
            title,
            body,
            message.data[NotificationChannels.EXTRA_OBJECT_TYPE],
            message.data[NotificationChannels.EXTRA_OBJECT_ID],
        )
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
