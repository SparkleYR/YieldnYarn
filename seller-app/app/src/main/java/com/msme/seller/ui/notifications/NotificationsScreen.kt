package com.msme.seller.ui.notifications

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
import androidx.compose.material.icons.outlined.CurrencyRupee
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.core.model.Notification
import com.msme.seller.ui.components.AppCard
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.EmptyState
import com.msme.seller.ui.components.ErrorState
import com.msme.seller.ui.components.IconBox
import com.msme.seller.ui.components.LoadingBox

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    contentPadding: PaddingValues,
    onOpenListing: (Long) -> Unit,
    onOpenBids: () -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        if (state.unread > 0) {
            Row(Modifier.fillMaxWidth().padding(horizontal = Dimens.screen / 2), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = viewModel::markAllRead) {
                    Icon(Icons.Outlined.DoneAll, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                    Text(stringResource(R.string.action_mark_all_read), style = MaterialTheme.typography.labelLarge)
                }
            }
        }
        PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
            when {
                state.loading -> LoadingBox()
                state.error != null && state.items.isEmpty() -> ErrorState(state.error.orEmpty(), viewModel::refresh)
                state.items.isEmpty() -> EmptyState(
                    Icons.Outlined.NotificationsNone,
                    stringResource(R.string.notifications_empty_title),
                    stringResource(R.string.notifications_empty_body),
                )
                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(Dimens.screen),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                ) {
                    items(state.items, key = { it.id }) { note ->
                        NotificationCard(note) {
                            viewModel.open(note)
                            when (note.relatedObjectType) {
                                "listing" -> note.relatedObjectId?.let(onOpenListing)
                                "bid" -> onOpenBids()
                            }
                        }
                    }
                }
            }
        }
    }
}

/** One update. Unread ones sit on light green, read ones on white. Also used on Home. */
@Composable
fun NotificationCard(note: Notification, onClick: () -> Unit) {
    val icon = when (note.type) {
        "GRADING_COMPLETE" -> Icons.Outlined.Verified
        "BID_RECEIVED" -> Icons.Outlined.LocalOffer
        "ORDER_MATCHED" -> Icons.Outlined.CurrencyRupee
        "DISPUTE_UPDATE" -> Icons.Outlined.ReportProblem
        else -> Icons.Outlined.Info
    }
    val container = if (note.isRead) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.primaryContainer
    AppCard(modifier = Modifier.fillMaxWidth(), onClick = onClick, containerColor = container) {
        Row(verticalAlignment = Alignment.Top) {
            IconBox(icon)
            Column(Modifier.weight(1f).padding(start = Dimens.gap), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(note.title, style = MaterialTheme.typography.titleSmall)
                note.message?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                note.createdAt?.let {
                    Text(
                        it.take(16).replace('T', ' '),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
