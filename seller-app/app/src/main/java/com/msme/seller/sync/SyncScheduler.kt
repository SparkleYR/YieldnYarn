package com.msme.seller.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    private val workManager get() = WorkManager.getInstance(context)

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Sync as soon as there's a connection (runs immediately when online). */
    fun syncNow() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        workManager.enqueueUniqueWork(ONE_TIME, ExistingWorkPolicy.REPLACE, request)
    }

    /** Safety net for drafts whose one-time work gave up: re-check every 30 min. */
    fun schedulePeriodic() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(online)
            .build()
        workManager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun cancelAll() {
        workManager.cancelUniqueWork(ONE_TIME)
        workManager.cancelUniqueWork(PERIODIC)
    }

    // A getter, not an initializer: touching WorkManager while Hilt is still
    // injecting SellerApp would initialize it before the worker factory is set.
    val isSyncing: Flow<Boolean>
        get() = workManager.getWorkInfosForUniqueWorkFlow(ONE_TIME).map { infos -> infos.any { it.state == WorkInfo.State.RUNNING } }

    private companion object {
        const val ONE_TIME = "sync-drafts"
        const val PERIODIC = "sync-drafts-periodic"
    }
}
