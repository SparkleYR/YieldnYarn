package com.msme.seller.ui.dashboard

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.core.model.Notification
import com.msme.seller.ui.components.SectionTitle

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
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            item {
                Text(
                    stringResource(R.string.dashboard_greeting, state.sellerName),
                    style = MaterialTheme.typography.headlineSmall,
                )
            }
            state.offlineMessage?.let { message ->
                item { Banner(Icons.Outlined.CloudOff, message) }
            }
            val stats = state.stats
            if (stats != null && stats.unsyncedDrafts > 0) {
                item {
                    Banner(
                        Icons.Outlined.CloudUpload,
                        if (state.syncing) {
                            stringResource(R.string.dashboard_syncing)
                        } else {
                            pluralStringResource(R.plurals.dashboard_unsynced, stats.unsyncedDrafts, stats.unsyncedDrafts)
                        },
                        onClick = onOpenListings,
                    )
                }
            }
            if (stats != null) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatTile(stringResource(R.string.stat_active), stats.activeListings.toString(), Modifier.weight(1f), onOpenListings)
                        StatTile(stringResource(R.string.stat_pending_grades), stats.pendingGrades.toString(), Modifier.weight(1f), onOpenListings)
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatTile(stringResource(R.string.stat_bids_waiting), stats.bidsAwaitingYou.toString(), Modifier.weight(1f), onOpenBids)
                        StatTile(stringResource(R.string.stat_stock_value), Money.rupees(stats.activeStockValue), Modifier.weight(1f), onOpenListings)
                    }
                }
            }
            item { SectionTitle(stringResource(R.string.dashboard_recent_updates)) }
            if (state.recentNotifications.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.dashboard_no_updates),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(state.recentNotifications, key = { it.id }) { note -> NotificationPreview(note, onOpenNotifications) }
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, modifier: Modifier, onClick: () -> Unit) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Banner(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, onClick: (() -> Unit)? = null) {
    Card(
        modifier = Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        ),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null)
            Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 12.dp))
        }
    }
}

@Composable
private fun NotificationPreview(note: Notification, onClick: () -> Unit) {
    OutlinedCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(14.dp)) {
            Text(note.title, style = MaterialTheme.typography.titleSmall)
            note.message?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
