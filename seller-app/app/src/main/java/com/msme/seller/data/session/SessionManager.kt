package com.msme.seller.data.session

import android.content.Context
import androidx.core.content.edit
import com.msme.seller.core.api.TokenStore
import com.msme.seller.core.model.User
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed interface SessionState {
    data object LoggedOut : SessionState
    data class LoggedIn(val userId: Long, val email: String, val displayName: String) : SessionState
}

/**
 * JWT pair + who is logged in, in private SharedPreferences. Also the
 * [TokenStore] the API client reads/refreshes tokens through, which is why it
 * must be safe to call from OkHttp's threads.
 */
@Singleton
class SessionManager @Inject constructor(@ApplicationContext context: Context) : TokenStore {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(readState())
    val state: StateFlow<SessionState> = _state.asStateFlow()

    val currentUserId: Long? get() = (state.value as? SessionState.LoggedIn)?.userId

    override var accessToken: String?
        get() = prefs.getString(KEY_ACCESS, null)
        set(value) = prefs.edit { putString(KEY_ACCESS, value) }

    override var refreshToken: String?
        get() = prefs.getString(KEY_REFRESH, null)
        set(value) = prefs.edit { putString(KEY_REFRESH, value) }

    /** Last FCM token registered with the backend, so logout can unregister it. */
    var pushToken: String?
        get() = prefs.getString(KEY_PUSH, null)
        set(value) = prefs.edit { putString(KEY_PUSH, value) }

    fun startSession(access: String, refresh: String?, user: User) {
        prefs.edit {
            putString(KEY_ACCESS, access)
            putString(KEY_REFRESH, refresh)
            putLong(KEY_USER_ID, user.id)
            putString(KEY_EMAIL, user.email)
            putString(KEY_NAME, user.displayName)
        }
        _state.value = readState()
    }

    fun updateDisplayName(name: String) {
        prefs.edit { putString(KEY_NAME, name) }
        _state.value = readState()
    }

    fun clear() {
        prefs.edit { clear() }
        _state.value = SessionState.LoggedOut
    }

    override fun onSessionExpired() = clear()

    private fun readState(): SessionState {
        val id = prefs.getLong(KEY_USER_ID, -1)
        if (id < 0 || prefs.getString(KEY_REFRESH, null) == null) return SessionState.LoggedOut
        return SessionState.LoggedIn(
            userId = id,
            email = prefs.getString(KEY_EMAIL, "").orEmpty(),
            displayName = prefs.getString(KEY_NAME, "").orEmpty(),
        )
    }

    private companion object {
        const val KEY_ACCESS = "access"
        const val KEY_REFRESH = "refresh"
        const val KEY_USER_ID = "user_id"
        const val KEY_EMAIL = "email"
        const val KEY_NAME = "display_name"
        const val KEY_PUSH = "push_token"
    }
}
