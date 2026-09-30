package com.msme.seller.ui.navigation

import androidx.annotation.StringRes
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.msme.seller.R
import com.msme.seller.data.session.SessionState
import com.msme.seller.ui.auth.LoginScreen
import com.msme.seller.ui.auth.RegisterScreen
import com.msme.seller.ui.bids.BidsScreen
import com.msme.seller.ui.create.CreateListingScreen
import com.msme.seller.ui.dashboard.DashboardScreen
import com.msme.seller.ui.listings.ListingDetailScreen
import com.msme.seller.ui.listings.MyListingsScreen
import com.msme.seller.ui.notifications.NotificationsScreen
import com.msme.seller.ui.profile.ProfileScreen
import kotlinx.coroutines.launch

object Routes {
    const val LOGIN = "login"
    const val REGISTER = "register"
    const val DASHBOARD = "dashboard"
    const val LISTINGS = "listings"
    const val BIDS = "bids"
    const val NOTIFICATIONS = "notifications"
    const val PROFILE = "profile"
    const val CREATE = "create"
    const val LISTING_DETAIL = "listing/{listingId}"

    fun listingDetail(id: Long) = "listing/$id"
}

private enum class Tab(val route: String, @StringRes val label: Int, val icon: ImageVector) {
    DASHBOARD(Routes.DASHBOARD, R.string.tab_home, Icons.Outlined.Home),
    LISTINGS(Routes.LISTINGS, R.string.tab_listings, Icons.Outlined.Inventory2),
    BIDS(Routes.BIDS, R.string.tab_bids, Icons.Outlined.LocalOffer),
    NOTIFICATIONS(Routes.NOTIFICATIONS, R.string.tab_alerts, Icons.Outlined.Notifications),
    PROFILE(Routes.PROFILE, R.string.tab_profile, Icons.Outlined.Person),
}

/** Where a push-notification tap should land (see push/NotificationChannels.kt). */
data class DeepLink(val objectType: String?, val objectId: Long?)

@Composable
fun SellerNavHost(session: SessionState, deepLink: DeepLink?, onDeepLinkHandled: () -> Unit) {
    if (session is SessionState.LoggedOut) {
        AuthNavHost()
    } else {
        MainNavHost(deepLink, onDeepLinkHandled)
    }
}

@Composable
private fun AuthNavHost() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = Routes.LOGIN) {
        composable(Routes.LOGIN) { LoginScreen(onRegister = { nav.navigate(Routes.REGISTER) }) }
        composable(Routes.REGISTER) { RegisterScreen(onLogin = { nav.popBackStack() }) }
    }
}

/** Switch bottom tabs the standard way: one copy of each tab, state saved/restored. */
private fun NavHostController.selectTab(route: String) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainNavHost(deepLink: DeepLink?, onDeepLinkHandled: () -> Unit) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val backStack by nav.currentBackStackEntryAsState()
    val currentTab = Tab.entries.firstOrNull { it.route == backStack?.destination?.route }

    LaunchedEffect(deepLink) {
        if (deepLink == null) return@LaunchedEffect
        when (deepLink.objectType) {
            "listing" -> deepLink.objectId?.let { nav.navigate(Routes.listingDetail(it)) }
            "bid" -> nav.selectTab(Routes.BIDS)
            else -> nav.selectTab(Routes.NOTIFICATIONS)
        }
        onDeepLinkHandled()
    }

    // The bars only belong to the five tab screens; create/detail are
    // full-screen with their own top bars.
    Scaffold(
        topBar = {
            if (currentTab != null) {
                CenterAlignedTopAppBar(
                    title = { Text(stringResource(currentTab.label), style = MaterialTheme.typography.titleLarge) },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                )
            }
        },
        bottomBar = {
            if (currentTab != null) {
                Column {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                        Tab.entries.forEach { tab ->
                            NavigationBarItem(
                                selected = currentTab == tab,
                                onClick = { nav.selectTab(tab.route) },
                                icon = { Icon(tab.icon, contentDescription = null, modifier = Modifier.size(26.dp)) },
                                label = { Text(stringResource(tab.label), style = MaterialTheme.typography.labelMedium) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = MaterialTheme.colorScheme.primary,
                                    selectedTextColor = MaterialTheme.colorScheme.primary,
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                ),
                            )
                        }
                    }
                }
            }
        },
        floatingActionButton = {
            if (currentTab == Tab.DASHBOARD || currentTab == Tab.LISTINGS) {
                ExtendedFloatingActionButton(
                    onClick = { nav.navigate(Routes.CREATE) },
                    icon = { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(26.dp)) },
                    text = { Text(stringResource(R.string.action_new_listing), style = MaterialTheme.typography.labelLarge) },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val openListing: (Long) -> Unit = { nav.navigate(Routes.listingDetail(it)) }
        NavHost(nav, startDestination = Routes.DASHBOARD) {
            composable(Routes.DASHBOARD) {
                DashboardScreen(
                    contentPadding = padding,
                    onOpenListings = { nav.selectTab(Routes.LISTINGS) },
                    onOpenBids = { nav.selectTab(Routes.BIDS) },
                    onOpenNotifications = { nav.selectTab(Routes.NOTIFICATIONS) },
                )
            }
            composable(Routes.LISTINGS) { MyListingsScreen(contentPadding = padding, onOpenListing = openListing) }
            composable(Routes.BIDS) { BidsScreen(contentPadding = padding, snackbar = snackbar) }
            composable(Routes.NOTIFICATIONS) {
                NotificationsScreen(
                    contentPadding = padding,
                    onOpenListing = openListing,
                    onOpenBids = { nav.selectTab(Routes.BIDS) },
                )
            }
            composable(Routes.PROFILE) { ProfileScreen(contentPadding = padding) }
            composable(Routes.CREATE) {
                CreateListingScreen(
                    onClose = { nav.popBackStack() },
                    onSaved = {
                        nav.popBackStack()
                        nav.selectTab(Routes.LISTINGS)
                        scope.launch { snackbar.showSnackbar(context.getString(R.string.create_saved_message)) }
                    },
                )
            }
            composable(
                Routes.LISTING_DETAIL,
                arguments = listOf(navArgument("listingId") { type = NavType.LongType }),
            ) {
                ListingDetailScreen(onBack = { nav.popBackStack() })
            }
        }
    }
}

