package com.msme.seller.data.repo

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.model.LoginRequest
import com.msme.seller.core.model.RegisterRequest
import com.msme.seller.core.model.Role
import com.msme.seller.data.EvidenceFiles
import com.msme.seller.data.local.AppDatabase
import com.msme.seller.data.session.SessionManager
import com.msme.seller.push.PushTokenRegistrar
import com.msme.seller.sync.SyncScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

sealed interface AuthOutcome {
    data object Success : AuthOutcome
    data object NotASeller : AuthOutcome
    data class Failed(val message: String) : AuthOutcome
}

@Singleton
class AuthRepository @Inject constructor(
    private val api: SellerApi,
    private val session: SessionManager,
    private val db: AppDatabase,
    private val evidenceFiles: EvidenceFiles,
    private val pushRegistrar: PushTokenRegistrar,
    private val syncScheduler: SyncScheduler,
) {
    suspend fun login(email: String, password: String): AuthOutcome {
        val tokens = when (val result = apiCall { api.login(LoginRequest(email.trim(), password)) }) {
            is ApiResult.Success -> result.value
            is ApiResult.HttpError -> return AuthOutcome.Failed(
                if (result.code == 401) "Wrong email or password." else result.message,
            )
            is ApiResult.NetworkError -> return AuthOutcome.Failed("Can't reach the server. Check your connection.")
        }
        // Hold the token just long enough to ask who this is.
        session.accessToken = tokens.access
        val user = when (val me = apiCall { api.me() }) {
            is ApiResult.Success -> me.value
            else -> {
                session.clear()
                return AuthOutcome.Failed("Couldn't load your account. Please try again.")
            }
        }
        // Enforced here, not just in the UI copy: buyers/admins/verifiers use
        // the web dashboards, and a non-seller token would 403 on half this app.
        if (user.role != Role.SELLER) {
            session.clear()
            return AuthOutcome.NotASeller
        }
        session.startSession(tokens.access, tokens.refresh, user)
        pushRegistrar.registerCurrentToken()
        syncScheduler.schedulePeriodic()
        syncScheduler.syncNow()
        return AuthOutcome.Success
    }

    suspend fun register(email: String, password: String, phone: String, displayName: String): AuthOutcome {
        val request = RegisterRequest(email.trim(), password, phone.trim(), Role.SELLER, displayName.trim())
        return when (val result = apiCall { api.register(request) }) {
            is ApiResult.Success -> login(email, password)
            is ApiResult.HttpError -> AuthOutcome.Failed(result.message)
            is ApiResult.NetworkError -> AuthOutcome.Failed("Can't reach the server. Check your connection.")
        }
    }

    /** Drafts that would be lost by logging out (they belong to this account). */
    suspend fun unsyncedDraftCount(): Int = db.draftDao().count()

    suspend fun logout() {
        pushRegistrar.unregister()
        syncScheduler.cancelAll()
        withContext(Dispatchers.IO) {
            db.clearAllTables()
            evidenceFiles.deleteAll()
        }
        session.clear()
    }
}
