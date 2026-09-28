package com.msme.seller

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.data.session.SessionManager
import com.msme.seller.data.session.SessionState
import com.msme.seller.push.NotificationChannels
import com.msme.seller.ui.navigation.DeepLink
import com.msme.seller.ui.navigation.SellerNavHost
import com.msme.seller.ui.theme.SellerTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

// AppCompatActivity (not plain ComponentActivity) so the per-app language
// picked on the Profile screen applies via AppCompatDelegate.
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject lateinit var session: SessionManager

    private var deepLink by mutableStateOf<DeepLink?>(null)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best effort */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) deepLink = intent.toDeepLink()

        setContent {
            SellerTheme {
                val state by session.state.collectAsStateWithLifecycle()
                LaunchedEffect(state) { if (state is SessionState.LoggedIn) askForNotificationPermission() }
                SellerNavHost(state, deepLink, onDeepLinkHandled = { deepLink = null })
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.toDeepLink()?.let { deepLink = it }
    }

    private var askedForNotifications = false

    private fun askForNotificationPermission() {
        if (askedForNotifications || Build.VERSION.SDK_INT < 33) return
        askedForNotifications = true
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun Intent.toDeepLink(): DeepLink? {
        val type = getStringExtra(NotificationChannels.EXTRA_OBJECT_TYPE) ?: return null
        return DeepLink(type, getStringExtra(NotificationChannels.EXTRA_OBJECT_ID)?.toLongOrNull())
    }
}
