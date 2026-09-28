package com.msme.seller.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.model.Notification
import com.msme.seller.data.repo.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotificationsUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val items: List<Notification> = emptyList(),
    val error: String? = null,
) {
    val unread get() = items.count { !it.isRead }
}

@HiltViewModel
class NotificationsViewModel @Inject constructor(private val repository: NotificationRepository) : ViewModel() {
    private val _state = MutableStateFlow(NotificationsUiState())
    val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(refreshing = !it.loading, error = null) }
        viewModelScope.launch {
            when (val result = repository.all()) {
                is ApiResult.Success -> _state.update { it.copy(loading = false, refreshing = false, items = result.value) }
                else -> _state.update { it.copy(loading = false, refreshing = false, error = result.errorMessage) }
            }
        }
    }

    fun open(notification: Notification) {
        if (notification.isRead) return
        markLocally(setOf(notification.id))
        viewModelScope.launch { repository.markRead(notification.id) }
    }

    fun markAllRead() {
        markLocally(state.value.items.map { it.id }.toSet())
        viewModelScope.launch { repository.markAllRead() }
    }

    private fun markLocally(ids: Set<Long>) = _state.update { s ->
        s.copy(items = s.items.map { if (it.id in ids) it.copy(isRead = true) else it })
    }
}
