package com.msme.seller

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.msme.seller.push.NotificationChannels
import com.msme.seller.sync.SyncScheduler
import com.msme.seller.data.session.SessionManager
import com.msme.seller.data.session.SessionState
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class SellerApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var session: SessionManager

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        NotificationChannels.create(this)
        if (session.state.value is SessionState.LoggedIn) {
            syncScheduler.schedulePeriodic()
            syncScheduler.syncNow()
        }
    }
}
