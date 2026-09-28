package com.msme.seller.ui.profile

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.model.Profile
import com.msme.seller.core.model.User
import com.msme.seller.data.repo.AuthRepository
import com.msme.seller.data.repo.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val loading: Boolean = true,
    val user: User? = null,
    val displayName: String = "",
    val phone: String = "",
    val language: String = "en",
    val saving: Boolean = false,
    val savedOnce: Boolean = false,
    val error: String? = null,
    val confirmLogout: Int? = null, // unsynced draft count while the dialog is open
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val profiles: ProfileRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            when (val result = profiles.me()) {
                is ApiResult.Success -> {
                    val user = result.value
                    _state.update {
                        it.copy(
                            loading = false,
                            user = user,
                            displayName = user.profile?.displayName.orEmpty(),
                            phone = user.phone.orEmpty(),
                            language = user.profile?.preferredLanguage?.takeIf { l -> l in LANGUAGES } ?: currentAppLanguage(),
                        )
                    }
                }
                else -> _state.update { it.copy(loading = false, error = result.errorMessage) }
            }
        }
    }

    fun onDisplayName(value: String) = _state.update { it.copy(displayName = value, savedOnce = false) }
    fun onPhone(value: String) = _state.update { it.copy(phone = value, savedOnce = false) }

    fun onLanguage(code: String) {
        _state.update { it.copy(language = code, savedOnce = false) }
        // Applies immediately (the activity recreates in the new language);
        // AppCompat persists the choice across restarts.
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(code))
    }

    fun save() {
        val s = state.value
        _state.update { it.copy(saving = true, error = null) }
        viewModelScope.launch {
            val profile = (s.user?.profile ?: Profile()).copy(displayName = s.displayName.trim(), preferredLanguage = s.language)
            when (val result = profiles.update(s.phone.trim(), profile)) {
                is ApiResult.Success -> _state.update { it.copy(saving = false, savedOnce = true, user = result.value) }
                else -> _state.update { it.copy(saving = false, error = result.errorMessage) }
            }
        }
    }

    fun requestLogout() {
        viewModelScope.launch { _state.update { it.copy(confirmLogout = auth.unsyncedDraftCount()) } }
    }

    fun dismissLogout() = _state.update { it.copy(confirmLogout = null) }

    fun logout() {
        _state.update { it.copy(confirmLogout = null) }
        viewModelScope.launch { auth.logout() }
    }

    private fun currentAppLanguage(): String =
        AppCompatDelegate.getApplicationLocales()[0]?.language?.takeIf { it in LANGUAGES } ?: "en"

    companion object {
        val LANGUAGES = listOf("en", "hi")
    }
}
