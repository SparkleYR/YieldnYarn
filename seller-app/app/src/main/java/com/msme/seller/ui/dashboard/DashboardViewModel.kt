package com.msme.seller.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.model.Bid
import com.msme.seller.core.model.Notification
import com.msme.seller.core.stats.DashboardStats
import com.msme.seller.data.repo.BidRepository
import com.msme.seller.data.repo.ListingRepository
import com.msme.seller.data.repo.NotificationRepository
import com.msme.seller.data.session.SessionManager
import com.msme.seller.data.session.SessionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DashboardUiState(
    val sellerName: String = "",
    val stats: DashboardStats? = null,
    val recentNotifications: List<Notification> = emptyList(),
    val refreshing: Boolean = false,
    val syncing: Boolean = false,
    val offlineMessage: String? = null,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val listings: ListingRepository,
    private val bids: BidRepository,
    private val notifications: NotificationRepository,
    session: SessionManager,
) : ViewModel() {
    private val bidList = MutableStateFlow<List<Bid>>(emptyList())
    private val recent = MutableStateFlow<List<Notification>>(emptyList())
    private val refreshing = MutableStateFlow(false)
    private val offline = MutableStateFlow<String?>(null)

    val state: StateFlow<DashboardUiState> = combine(
        listings.observeMyListings(),
        bidList,
        recent,
        combine(refreshing, offline, listings.isSyncing) { r, o, s -> Triple(r, o, s) },
        session.state,
    ) { items, bids, notes, (isRefreshing, offlineMsg, isSyncing), sessionState ->
        DashboardUiState(
            sellerName = (sessionState as? SessionState.LoggedIn)?.displayName.orEmpty(),
            stats = DashboardStats.compute(
                items.map { DashboardStats.Companion.ListingLike(it.status, it.quantity, it.price) },
                bids,
            ),
            recentNotifications = notes,
            refreshing = isRefreshing,
            syncing = isSyncing,
            offlineMessage = offlineMsg,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardUiState())

    init {
        refresh()
    }

    fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        viewModelScope.launch {
            listings.syncNow()
            val listingResult = async { listings.refresh() }
            val bidResult = async { bids.all() }
            val noteResult = async { notifications.all() }
            (bidResult.await() as? ApiResult.Success)?.let { bidList.value = it.value }
            (noteResult.await() as? ApiResult.Success)?.let { result ->
                recent.value = result.value.filterNot { it.isRead }.take(3)
            }
            val listingOutcome = listingResult.await()
            offline.value = if (listingOutcome is ApiResult.NetworkError) listingOutcome.errorMessage else null
            refreshing.value = false
        }
    }
}
