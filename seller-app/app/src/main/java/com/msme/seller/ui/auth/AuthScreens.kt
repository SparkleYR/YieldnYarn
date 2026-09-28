package com.msme.seller.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Agriculture
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.msme.seller.R
import com.msme.seller.ui.components.ErrorBanner

@Composable
private fun AuthScaffold(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Spacer(Modifier.height(32.dp))
        Icon(
            Icons.Outlined.Agriculture,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(48.dp),
        )
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        content()
    }
}

@Composable
private fun SubmitButton(text: String, busy: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(52.dp)) {
        if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp) else Text(text)
    }
}

@Composable
fun LoginScreen(onRegister: () -> Unit, viewModel: AuthViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    AuthScaffold(stringResource(R.string.login_title), stringResource(R.string.login_subtitle)) {
        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmail,
            label = { Text(stringResource(R.string.field_email)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPassword,
            label = { Text(stringResource(R.string.field_password)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (viewModel.canLogin) viewModel.login() }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (state.notASeller) ErrorBanner(stringResource(R.string.login_not_a_seller))
        state.error?.let { ErrorBanner(it) }
        SubmitButton(stringResource(R.string.action_login), state.busy, viewModel.canLogin, viewModel::login)
        TextButton(onClick = onRegister, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(stringResource(R.string.login_no_account))
        }
    }
}

@Composable
fun RegisterScreen(onLogin: () -> Unit, viewModel: AuthViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    AuthScaffold(stringResource(R.string.register_title), stringResource(R.string.register_subtitle)) {
        OutlinedTextField(
            value = state.displayName,
            onValueChange = viewModel::onDisplayName,
            label = { Text(stringResource(R.string.field_business_name)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmail,
            label = { Text(stringResource(R.string.field_email)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.phone,
            onValueChange = viewModel::onPhone,
            label = { Text(stringResource(R.string.field_phone_optional)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPassword,
            label = { Text(stringResource(R.string.field_password)) },
            supportingText = { Text(stringResource(R.string.password_hint, AuthViewModel.MIN_PASSWORD)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        state.error?.let { ErrorBanner(it) }
        SubmitButton(stringResource(R.string.action_create_account), state.busy, viewModel.canRegister, viewModel::register)
        TextButton(onClick = onLogin, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text(stringResource(R.string.register_have_account))
        }
    }
}
