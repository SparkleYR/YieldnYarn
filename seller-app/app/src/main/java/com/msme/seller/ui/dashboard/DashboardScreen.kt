package com.msme.seller.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.CurrencyRupee
import androidx.compose.material.icons.outlined.HourglassTop
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.ui.components.Banner
import com.msme.seller.ui.components.BannerTone
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.SectionTitle
import com.msme.seller.ui.components.StatTile
import com.msme.seller.ui.notifications.NotificationCard

@OptIn(ExperimentalMaterial3Api::class, ExperimentalComposeUiApi::class)
@Composable
fun DashboardScreen(
    contentPadding: PaddingValues,
    onOpenListings: () -> Unit,
    onOpenBids: () -> Unit,
    onOpenNotifications: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = viewModel::refresh,
        modifier = Modifier.fillMaxSize().padding(contentPadding),
    ) {
        LazyColumn(
            contentPadding = PaddingValues(start = Dimens.screen, end = Dimens.screen, top = Dimens.screen, bottom = Dimens.fabClearance),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
            modifier = Modifier.fillMaxSize(),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        stringResource(R.string.dashboard_greeting, state.sellerName),
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        stringResource(R.string.dashboard_subtitle),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            state.offlineMessage?.let { message ->
                item { Banner(message, Icons.Outlined.CloudOff, BannerTone.Warning) }
            }
            val stats = state.stats
            if (stats != null && stats.unsyncedDrafts > 0) {
                item {
                    Banner(
                        if (state.syncing) {
                            stringResource(R.string.dashboard_syncing)
                        } else {
                            pluralStringResource(R.plurals.dashboard_unsynced, stats.unsyncedDrafts, stats.unsyncedDrafts)
                        },
                        Icons.Outlined.CloudUpload,
                        BannerTone.Info,
                        onClick = onOpenListings,
                    )
                }
            }
            if (stats != null) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                        StatTile(stringResource(R.string.stat_active), stats.activeListings.toString(), Icons.Outlined.Storefront, Modifier.weight(1f), onOpenListings)
                        StatTile(stringResource(R.string.stat_pending_grades), stats.pendingGrades.toString(), Icons.Outlined.HourglassTop, Modifier.weight(1f), onOpenListings)
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
                        StatTile(stringResource(R.string.stat_bids_waiting), stats.bidsAwaitingYou.toString(), Icons.Outlined.LocalOffer, Modifier.weight(1f), onOpenBids)
                        StatTile(stringResource(R.string.stat_stock_value), Money.rupees(stats.activeStockValue), Icons.Outlined.CurrencyRupee, Modifier.weight(1f), onOpenListings)
                    }
                }
            }
            item { SectionTitle(stringResource(R.string.dashboard_recent_updates)) }
            if (state.recentNotifications.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.dashboard_no_updates),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(state.recentNotifications, key = { it.id }) { note -> NotificationCard(note, onOpenNotifications) }
        }
    }
}
