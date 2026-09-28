package com.msme.seller.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.msme.seller.core.sync.SyncEngine
import com.msme.seller.data.session.SessionManager
import com.msme.seller.data.session.SessionState
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/** Pushes offline drafts to the server whenever there's a connection (§8.3). */
@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val engine: SyncEngine,
    private val session: SessionManager,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (session.state.value is SessionState.LoggedOut) return Result.success()
        val report = engine.syncAll()
        // Retryable failures (offline, 5xx) back off exponentially; permanent
        // ones are left for the seller to fix from My Listings.
        return if (report.shouldRetry && runAttemptCount < MAX_ATTEMPTS) Result.retry() else Result.success()
    }

    private companion object {
        const val MAX_ATTEMPTS = 8
    }
}
