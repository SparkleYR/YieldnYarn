package com.msme.seller.ui.listings

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.core.listing.ListingFilter
import com.msme.seller.data.local.DraftSyncState
import com.msme.seller.data.repo.ListingItem
import com.msme.seller.ui.components.AppCard
import com.msme.seller.ui.components.ChoiceChips
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.EmptyState
import com.msme.seller.ui.components.ErrorBanner
import com.msme.seller.ui.components.GradePill
import com.msme.seller.ui.components.IconBox
import com.msme.seller.ui.components.LoadingBox
import com.msme.seller.ui.components.StatusPill
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyListingsScreen(
    contentPadding: PaddingValues,
    onOpenListing: (Long) -> Unit,
    viewModel: MyListingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        ChoiceChips(
            options = ListingFilter.entries.map { it to stringResource(it.label()) },
            selected = state.filter,
            onSelect = viewModel::setFilter,
        )
        state.error?.let { ErrorBanner(it, Modifier.padding(horizontal = Dimens.screen)) }
        PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
            when {
                !state.loaded -> LoadingBox()
                state.items.isEmpty() -> EmptyState(
                    Icons.Outlined.Inventory2,
                    stringResource(R.string.listings_empty_title),
                    stringResource(R.string.listings_empty_body),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = Dimens.screen, end = Dimens.screen, top = 4.dp, bottom = Dimens.fabClearance),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.items, key = { it.key }) { item ->
                        ListingCard(
                            item = item,
                            onClick = { item.serverId?.takeIf { item.syncState == null }?.let(onOpenListing) },
                            onRetry = { item.clientUuid?.let(viewModel::retryDraft) },
                            onDelete = { confirmDelete = item.clientUuid },
                        )
                    }
                }
            }
        }
    }

    confirmDelete?.let { uuid ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text(stringResource(R.string.draft_delete_title)) },
            text = { Text(stringResource(R.string.draft_delete_body)) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.deleteDraft(uuid)
                    confirmDelete = null
                }) { Text(stringResource(R.string.action_delete)) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}

private fun ListingFilter.label() = when (this) {
    ListingFilter.ALL -> R.string.filter_all
    ListingFilter.DRAFT -> R.string.filter_draft
    ListingFilter.PENDING -> R.string.filter_pending
    ListingFilter.ACTIVE -> R.string.filter_active
    ListingFilter.SOLD -> R.string.filter_sold
}

@Composable
private fun ListingCard(item: ListingItem, onClick: () -> Unit, onRetry: () -> Unit, onDelete: () -> Unit) {
    AppCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Row(verticalAlignment = Alignment.Top) {
            val photo = item.photoPaths.firstOrNull()
            if (photo != null) {
                AsyncImage(
                    model = File(photo),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(PHOTO_SIZE).clip(MaterialTheme.shapes.small),
                )
            } else {
                IconBox(Icons.Outlined.Inventory2, size = PHOTO_SIZE)
            }
            Column(Modifier.weight(1f).padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(item.commodityName, style = MaterialTheme.typography.titleMedium)
                if (item.subCategory.isNotBlank()) {
                    Text(item.subCategory, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                item.price?.let {
                    Text(stringResource(R.string.price_per_unit, Money.rupees(it), item.unit), style = MaterialTheme.typography.titleSmall)
                }
                Text(Money.quantity(item.quantity, item.unit), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (item.syncState == DraftSyncState.NEEDS_ATTENTION || item.syncState == DraftSyncState.RETRYING) {
                IconButton(onClick = onRetry) {
                    Icon(Icons.Outlined.Refresh, contentDescription = stringResource(R.string.action_retry))
                }
            }
            if (item.syncState != null && item.serverId == null) {
                IconButton(onClick = onDelete) {
                    Icon(Icons.Outlined.Delete, contentDescription = stringResource(R.string.action_delete))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
            StatusPill(item.status)
            GradePill(item.grade)
        }
        when (item.syncState) {
            DraftSyncState.PENDING -> SyncNote(stringResource(R.string.sync_waiting))
            DraftSyncState.RETRYING -> SyncNote(stringResource(R.string.sync_retrying, item.syncError.orEmpty()))
            DraftSyncState.NEEDS_ATTENTION -> SyncNote(
                stringResource(R.string.sync_needs_attention, item.syncError.orEmpty()),
                isError = true,
            )
            null -> Unit
        }
    }
}

private val PHOTO_SIZE = 72.dp

@Composable
private fun SyncNote(text: String, isError: Boolean = false) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
