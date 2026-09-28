package com.msme.seller.ui.listings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.listing.ListingFilter
import com.msme.seller.data.repo.ListingItem
import com.msme.seller.data.repo.ListingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MyListingsUiState(
    val filter: ListingFilter = ListingFilter.ALL,
    val items: List<ListingItem> = emptyList(),
    val loaded: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class MyListingsViewModel @Inject constructor(private val repository: ListingRepository) : ViewModel() {
    private val filter = MutableStateFlow(ListingFilter.ALL)
    private val refreshing = MutableStateFlow(false)
    private val error = MutableStateFlow<String?>(null)

    val state: StateFlow<MyListingsUiState> = combine(
        repository.observeMyListings(),
        filter,
        refreshing,
        error,
    ) { items, f, isRefreshing, err ->
        MyListingsUiState(f, items.filter { f.matches(it.status) }, loaded = true, refreshing = isRefreshing, error = err)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MyListingsUiState())

    init {
        refresh()
    }

    fun setFilter(value: ListingFilter) {
        filter.value = value
    }

    fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        viewModelScope.launch {
            repository.syncNow()
            val result = repository.refresh()
            // Offline is fine — the cached list still shows.
            error.value = (result as? ApiResult.HttpError)?.errorMessage
            refreshing.value = false
        }
    }

    fun retryDraft(clientUuid: String) = viewModelScope.launch { repository.retryDraft(clientUuid) }

    fun deleteDraft(clientUuid: String) = viewModelScope.launch { repository.deleteDraft(clientUuid) }
}
