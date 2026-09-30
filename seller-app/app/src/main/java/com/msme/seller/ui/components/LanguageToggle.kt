package com.msme.seller.ui.components

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat

private val LANGUAGES = listOf("en" to "English", "hi" to "हिन्दी")

/** The app's language right now ("en" or "hi"). */
fun currentAppLanguage(): String =
    AppCompatDelegate.getApplicationLocales()[0]?.language?.takeIf { code -> LANGUAGES.any { it.first == code } } ?: "en"

/** Switches the whole app's language; Android recreates the screen in it. */
fun setAppLanguage(code: String) {
    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(code))
}

/** English / हिन्दी switch, same look as the website's. */
@Composable
fun LanguageToggle(selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier,
    ) {
        Row(Modifier.padding(4.dp).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            LANGUAGES.forEach { (code, label) ->
                val active = code == selected
                Surface(
                    shape = MaterialTheme.shapes.extraSmall,
                    color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                    contentColor = if (active) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.selectable(selected = active, role = Role.RadioButton, onClick = { onSelect(code) }),
                ) {
                    Box(Modifier.heightIn(min = 44.dp).widthIn(min = 88.dp).padding(horizontal = 14.dp), contentAlignment = Alignment.Center) {
                        Text(label, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}
