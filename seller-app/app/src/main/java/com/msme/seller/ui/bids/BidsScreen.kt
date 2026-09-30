package com.msme.seller.ui.bids

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocalOffer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.ui.components.ChoiceChips
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.EmptyState
import com.msme.seller.ui.components.ErrorState
import com.msme.seller.ui.components.LoadingBox

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BidsScreen(
    contentPadding: PaddingValues,
    snackbar: SnackbarHostState,
    viewModel: BidsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(state.message) {
        state.message?.let { snackbar.showSnackbar(it.resolve(context)); viewModel.messageShown() }
    }

    Column(Modifier.fillMaxSize().padding(contentPadding)) {
        ChoiceChips(
            options = BidTab.entries.map { tab ->
                tab to stringResource(
                    when (tab) {
                        BidTab.NEEDS_YOU -> R.string.bids_tab_needs_you
                        BidTab.WAITING_ON_BUYER -> R.string.bids_tab_waiting
                        BidTab.CLOSED -> R.string.bids_tab_closed
                    },
                )
            },
            selected = state.tab,
            onSelect = viewModel::setTab,
        )
        PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
            when {
                state.loading -> LoadingBox()
                state.error != null && state.bids.isEmpty() -> ErrorState(state.error.orEmpty(), viewModel::refresh)
                state.visible.isEmpty() -> EmptyState(
                    Icons.Outlined.LocalOffer,
                    stringResource(R.string.bids_empty_title),
                    stringResource(R.string.bids_empty_body),
                )
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = Dimens.screen, end = Dimens.screen, top = 4.dp, bottom = Dimens.screen),
                    verticalArrangement = Arrangement.spacedBy(Dimens.gap),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    items(state.visible, key = { it.id }) { bid ->
                        BidCard(
                            bid = bid,
                            askingPrice = null,
                            busy = bid.id in state.busyIds,
                            onAccept = { viewModel.accept(bid) },
                            onReject = { viewModel.reject(bid) },
                            onCounter = { price, qty, msg -> viewModel.counter(bid, price, qty, msg) },
                            showCommodity = true,
                        )
                    }
                }
            }
        }
    }
}
