package com.msme.seller.ui.notifications

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CurrencyRupee
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.core.model.Notification
import com.msme.seller.ui.components.EmptyState
import com.msme.seller.ui.components.ErrorState
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
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = viewModel::markAllRead) { Text(stringResource(R.string.action_mark_all_read)) }
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
                else -> LazyColumn(Modifier.fillMaxSize()) {
                    items(state.items, key = { it.id }) { note ->
                        NotificationRow(note) {
                            viewModel.open(note)
                            when (note.relatedObjectType) {
                                "listing" -> note.relatedObjectId?.let(onOpenListing)
                                "bid" -> onOpenBids()
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(note: Notification, onClick: () -> Unit) {
    val icon = when (note.type) {
        "GRADING_COMPLETE" -> Icons.Outlined.Verified
        "BID_RECEIVED" -> Icons.Outlined.Gavel
        "ORDER_MATCHED" -> Icons.Outlined.CurrencyRupee
        "DISPUTE_UPDATE" -> Icons.Outlined.ReportProblem
        else -> Icons.Outlined.Info
    }
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                note.title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (note.isRead) FontWeight.Normal else FontWeight.SemiBold,
            )
            note.message?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            note.createdAt?.let {
                Text(it.take(16).replace('T', ' '), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (!note.isRead) {
            Surface(color = MaterialTheme.colorScheme.primary, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
        }
    }
}
