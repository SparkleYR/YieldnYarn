package com.msme.seller.ui.bids

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.bids.BidActions
import com.msme.seller.R
import com.msme.seller.core.model.Bid
import com.msme.seller.data.repo.BidRepository
import com.msme.seller.ui.components.UiText
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.math.BigDecimal
import javax.inject.Inject

enum class BidTab { NEEDS_YOU, WAITING_ON_BUYER, CLOSED }

data class BidsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val bids: List<Bid> = emptyList(),
    val tab: BidTab = BidTab.NEEDS_YOU,
    val error: String? = null,
    val busyIds: Set<Long> = emptySet(),
    val message: UiText? = null,
    /** Bumped after every successful accept/reject/counter, so observers can reload. */
    val revision: Int = 0,
) {
    val visible: List<Bid>
        get() = bids.filter { bid ->
            when (tab) {
                BidTab.NEEDS_YOU -> BidActions.forSeller(bid).any
                BidTab.WAITING_ON_BUYER -> bid.status == "PENDING" && bid.awaitingResponseFrom == "BUYER"
                BidTab.CLOSED -> bid.status != "PENDING"
            }
        }
}

@HiltViewModel
class BidsViewModel @Inject constructor(private val repository: BidRepository) : ViewModel() {
    private val _state = MutableStateFlow(BidsUiState())
    val state: StateFlow<BidsUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun setTab(tab: BidTab) = _state.update { it.copy(tab = tab) }

    fun refresh() {
        _state.update { it.copy(refreshing = !it.loading, error = null) }
        viewModelScope.launch {
            when (val result = repository.all()) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, refreshing = false, bids = result.value) }
                else -> _state.update { it.copy(loading = false, refreshing = false, error = result.errorMessage) }
            }
        }
    }

    fun accept(bid: Bid) = act(bid, R.string.bid_accepted_message) { repository.accept(bid.id) }

    fun reject(bid: Bid) = act(bid, R.string.bid_rejected_message) { repository.reject(bid.id) }

    fun counter(bid: Bid, price: BigDecimal, quantity: BigDecimal?, message: String) =
        act(bid, R.string.bid_countered_message) { repository.counter(bid.id, price, quantity, message) }

    fun messageShown() = _state.update { it.copy(message = null) }

    private fun act(bid: Bid, successMessage: Int, call: suspend () -> ApiResult<Bid>) {
        if (bid.id in state.value.busyIds) return
        _state.update { it.copy(busyIds = it.busyIds + bid.id) }
        viewModelScope.launch {
            val result = call()
            _state.update {
                it.copy(
                    busyIds = it.busyIds - bid.id,
                    message = if (result is ApiResult.Success) UiText.Res(successMessage) else UiText.Raw(result.errorMessage.orEmpty()),
                    revision = if (result is ApiResult.Success) it.revision + 1 else it.revision,
                )
            }
            if (result is ApiResult.Success) refresh()
        }
    }
}
