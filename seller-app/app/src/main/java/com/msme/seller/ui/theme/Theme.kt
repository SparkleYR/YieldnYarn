package com.msme.seller.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Emerald brand accent, matching the web app (implementation_plan.md §6.2).
private val Emerald = Color(0xFF10B981)
private val EmeraldDark = Color(0xFF047857)
private val EmeraldContainer = Color(0xFFD1FAE5)

private val LightColors = lightColorScheme(
    primary = EmeraldDark,
    onPrimary = Color.White,
    primaryContainer = EmeraldContainer,
    onPrimaryContainer = Color(0xFF022C22),
    secondary = Color(0xFF92400E),
    secondaryContainer = Color(0xFFFEF3C7),
    onSecondaryContainer = Color(0xFF451A03),
    background = Color(0xFFFAFAF9),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFF1F5F4),
    error = Color(0xFFB91C1C),
)

private val DarkColors = darkColorScheme(
    primary = Emerald,
    onPrimary = Color(0xFF022C22),
    primaryContainer = Color(0xFF065F46),
    onPrimaryContainer = EmeraldContainer,
    secondary = Color(0xFFFBBF24),
    secondaryContainer = Color(0xFF78350F),
    onSecondaryContainer = Color(0xFFFEF3C7),
    background = Color(0xFF0C0F0E),
    surface = Color(0xFF141917),
    surfaceVariant = Color(0xFF1F2624),
    error = Color(0xFFF87171),
)

@Composable
fun SellerTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) DarkColors else LightColors, content = content)
}
