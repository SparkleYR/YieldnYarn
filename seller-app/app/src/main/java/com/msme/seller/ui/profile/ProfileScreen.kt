package com.msme.seller.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.BuildConfig
import com.msme.seller.R
import com.msme.seller.ui.components.AppCard
import com.msme.seller.ui.components.HelpText
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.ErrorBanner
import com.msme.seller.ui.components.IconBox
import com.msme.seller.ui.components.LanguageToggle
import com.msme.seller.ui.components.PrimaryButton
import com.msme.seller.ui.components.SecondaryButton
import com.msme.seller.ui.components.LoadingBox
import com.msme.seller.ui.components.SectionTitle

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun ProfileScreen(contentPadding: PaddingValues, viewModel: ProfileViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    if (state.loading) {
        LoadingBox(Modifier.padding(contentPadding))
        return
    }
    Column(
        Modifier.fillMaxSize().padding(contentPadding).verticalScroll(rememberScrollState()).padding(Dimens.screen),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        state.user?.let {
            AppCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBox(Icons.Outlined.Person)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(state.displayName.ifBlank { it.email }, style = MaterialTheme.typography.titleMedium)
                        Text(it.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        state.error?.let { ErrorBanner(it) }
        OutlinedTextField(
            value = state.displayName,
            onValueChange = viewModel::onDisplayName,
            label = { Text(stringResource(R.string.field_business_name)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.phone,
            onValueChange = viewModel::onPhone,
            label = { Text(stringResource(R.string.field_phone)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            modifier = Modifier.fillMaxWidth(),
        )
        SectionTitle(stringResource(R.string.profile_language))
        LanguageToggle(selected = state.language, onSelect = viewModel::onLanguage)
        Spacer(Modifier.height(8.dp))
        PrimaryButton(
            stringResource(if (state.savedOnce) R.string.profile_saved else R.string.action_save),
            onClick = viewModel::save,
            busy = state.saving,
        )
        SecondaryButton(
            stringResource(R.string.action_logout),
            onClick = viewModel::requestLogout,
            icon = Icons.AutoMirrored.Outlined.Logout,
        )
        HelpText(stringResource(R.string.profile_version, BuildConfig.VERSION_NAME), Modifier.padding(top = 8.dp))
    }

    state.confirmLogout?.let { unsynced ->
        AlertDialog(
            onDismissRequest = viewModel::dismissLogout,
            title = { Text(stringResource(R.string.logout_title)) },
            text = {
                Text(
                    if (unsynced > 0) {
                        pluralStringResource(R.plurals.logout_unsynced_warning, unsynced, unsynced)
                    } else {
                        stringResource(R.string.logout_body)
                    },
                )
            },
            confirmButton = { TextButton(onClick = viewModel::logout) { Text(stringResource(R.string.action_logout)) } },
            dismissButton = { TextButton(onClick = viewModel::dismissLogout) { Text(stringResource(R.string.action_cancel)) } },
        )
    }
}
