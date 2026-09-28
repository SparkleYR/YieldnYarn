package com.msme.seller.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.data.repo.AuthOutcome
import com.msme.seller.data.repo.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val phone: String = "",
    val displayName: String = "",
    val busy: Boolean = false,
    val error: String? = null,
    val notASeller: Boolean = false,
)

@HiltViewModel
class AuthViewModel @Inject constructor(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun onEmail(value: String) = _state.update { it.copy(email = value, error = null, notASeller = false) }
    fun onPassword(value: String) = _state.update { it.copy(password = value, error = null) }
    fun onPhone(value: String) = _state.update { it.copy(phone = value, error = null) }
    fun onDisplayName(value: String) = _state.update { it.copy(displayName = value, error = null) }

    val canLogin get() = state.value.let { it.email.contains('@') && it.password.isNotEmpty() && !it.busy }
    val canRegister get() = state.value.let {
        it.email.contains('@') && it.password.length >= MIN_PASSWORD && it.displayName.isNotBlank() && !it.busy
    }

    fun login() = submit { auth.login(state.value.email, state.value.password) }

    fun register() = submit {
        val s = state.value
        auth.register(s.email, s.password, s.phone, s.displayName)
    }

    private fun submit(block: suspend () -> AuthOutcome) {
        if (state.value.busy) return
        _state.update { it.copy(busy = true, error = null, notASeller = false) }
        viewModelScope.launch {
            // On success SessionManager flips to LoggedIn and navigation swaps
            // to the main graph on its own; nothing to do here.
            when (val outcome = block()) {
                AuthOutcome.Success -> _state.update { it.copy(busy = false, password = "") }
                AuthOutcome.NotASeller -> _state.update { it.copy(busy = false, notASeller = true) }
                is AuthOutcome.Failed -> _state.update { it.copy(busy = false, error = outcome.message) }
            }
        }
    }

    companion object {
        const val MIN_PASSWORD = 8
    }
}
