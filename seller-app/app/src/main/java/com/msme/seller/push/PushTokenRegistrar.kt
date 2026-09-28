package com.msme.seller.push

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.model.DeviceTokenRequest
import com.msme.seller.core.model.DeviceTokenUnregisterRequest
import com.msme.seller.data.session.SessionManager
import com.msme.seller.data.session.SessionState
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Keeps the backend's DeviceToken for this phone current (register on login
 * and on token rotation, unregister on logout). A no-op when the build has no
 * Firebase config (no google-services.json).
 */
@Singleton
class PushTokenRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: SellerApi,
    private val session: SessionManager,
) {
    private val firebaseReady: Boolean
        get() = FirebaseApp.getApps(context).isNotEmpty()

    suspend fun registerCurrentToken() {
        if (!firebaseReady) return
        currentToken()?.let { register(it) }
    }

    suspend fun register(token: String) {
        if (session.state.value is SessionState.LoggedOut) return
        val result = apiCall { api.registerDevice(DeviceTokenRequest(token)) }
        if (result is ApiResult.Success) session.pushToken = token
    }

    suspend fun unregister() {
        val token = session.pushToken ?: return
        apiCall { api.unregisterDevice(DeviceTokenUnregisterRequest(token)) }
        session.pushToken = null
    }

    private suspend fun currentToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            cont.resume(if (task.isSuccessful) task.result else null)
        }
    }
}
