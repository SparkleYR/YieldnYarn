package com.msme.seller.ui.listings

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.data.repo.ListingDetail
import com.msme.seller.data.repo.ListingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ListingDetailUiState(
    val loading: Boolean = true,
    val detail: ListingDetail? = null,
    val error: String? = null,
    val regrading: Boolean = false,
    val message: String? = null,
)

@HiltViewModel
class ListingDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: ListingRepository,
) : ViewModel() {
    val listingId: Long = checkNotNull(savedStateHandle.get<Long>("listingId"))

    private val _state = MutableStateFlow(ListingDetailUiState())
    val state: StateFlow<ListingDetailUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val result = repository.detail(listingId)) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, detail = result.value) }
                else -> _state.update { it.copy(loading = false, error = result.errorMessage) }
            }
        }
    }

    fun regrade() {
        _state.update { it.copy(regrading = true) }
        viewModelScope.launch {
            val result = repository.regrade(listingId)
            _state.update { it.copy(regrading = false, message = result.errorMessage) }
            if (result is ApiResult.Success) load()
        }
    }

    fun messageShown() = _state.update { it.copy(message = null) }
}
