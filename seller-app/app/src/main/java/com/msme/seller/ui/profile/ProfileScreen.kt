package com.msme.seller.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.BuildConfig
import com.msme.seller.R
import com.msme.seller.ui.components.ErrorBanner
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
        Modifier.fillMaxSize().padding(contentPadding).verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        state.user?.let {
            Text(it.email, style = MaterialTheme.typography.titleMedium)
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
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = state.language == "en", onClick = { viewModel.onLanguage("en") }, label = { Text("English") })
            FilterChip(selected = state.language == "hi", onClick = { viewModel.onLanguage("hi") }, label = { Text("हिन्दी") })
        }
        Button(onClick = viewModel::save, enabled = !state.saving, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(if (state.savedOnce) R.string.profile_saved else R.string.action_save))
        }
        OutlinedButton(onClick = viewModel::requestLogout, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Outlined.Logout, contentDescription = null)
            Text(stringResource(R.string.action_logout), Modifier.padding(start = 8.dp))
        }
        Text(
            stringResource(R.string.profile_version, BuildConfig.VERSION_NAME),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
