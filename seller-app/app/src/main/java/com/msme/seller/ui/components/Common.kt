package com.msme.seller.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.msme.seller.R
import com.msme.seller.core.listing.ListingStatus

/** One set of sizes for every screen, so paddings and gaps never drift. */
object Dimens {
    /** Left/right/top padding of every screen. */
    val screen = 16.dp
    /** Gap between cards and between items in a list. */
    val gap = 12.dp
    /** Padding inside every card. */
    val cardPadding = 16.dp
    /** Space above a section title. */
    val section = 8.dp
    /** Height of every main button. */
    val button = 56.dp
    /** Minimum height of stat tiles, so tiles in a row always match. */
    val tile = 116.dp
    val iconBox = 44.dp
    /** Room at the bottom of scrolling lists for the "Sell" button. */
    val fabClearance = 96.dp
}

/**
 * White card with a thin border — the one card style used everywhere.
 * [selected] turns it light green with a thick green border (for choices).
 */
@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surface,
    selected: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else containerColor)
    val border = if (selected) {
        BorderStroke(2.dp, MaterialTheme.colorScheme.primary)
    } else {
        BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    }
    val inner: @Composable ColumnScope.() -> Unit = {
        Column(Modifier.padding(Dimens.cardPadding), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
    if (onClick != null) {
        Card(onClick = onClick, modifier = modifier, shape = MaterialTheme.shapes.medium, colors = colors, border = border, content = inner)
    } else {
        Card(modifier = modifier, shape = MaterialTheme.shapes.medium, colors = colors, border = border, content = inner)
    }
}

/** Number + label tile. Put two in a Row with Modifier.weight(1f) — they share one height. */
@Composable
fun StatTile(label: String, value: String, icon: ImageVector, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    AppCard(modifier = modifier.heightIn(min = Dimens.tile), onClick = onClick) {
        IconBox(icon, size = 36.dp)
        Text(value, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Rounded square with an icon on a light green background. */
@Composable
fun IconBox(icon: ImageVector, modifier: Modifier = Modifier, size: androidx.compose.ui.unit.Dp = Dimens.iconBox) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.primary,
        shape = MaterialTheme.shapes.small,
        modifier = modifier.size(size),
    ) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = null, modifier = Modifier.size(size * 0.55f)) }
    }
}

/** Full-width 56dp main action. Shows a spinner while [busy]. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
    icon: ImageVector? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !busy,
        modifier = modifier.fillMaxWidth().heightIn(min = Dimens.button),
        shape = MaterialTheme.shapes.small,
    ) {
        ButtonContent(text, busy, icon)
    }
}

/** Outlined twin of [PrimaryButton], same size. */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().heightIn(min = Dimens.button),
        shape = MaterialTheme.shapes.small,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        ButtonContent(text, false, icon)
    }
}

@Composable
private fun RowScope.ButtonContent(text: String, busy: Boolean, icon: ImageVector?) {
    if (busy) {
        CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary)
    } else {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
        }
        Text(text, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        IconBox(icon, size = 72.dp)
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 20.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (action != null) Box(Modifier.padding(top = 24.dp)) { action() }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    EmptyState(
        icon = Icons.Outlined.ErrorOutline,
        title = stringResource(R.string.error_title),
        body = message,
        modifier = modifier,
        action = { Button(onClick = onRetry, modifier = Modifier.heightIn(min = Dimens.button)) { Text(stringResource(R.string.action_retry)) } },
    )
}

enum class BannerTone { Info, Warning, Error, Success }

/** Coloured message strip with an icon (sync status, errors, tips). */
@Composable
fun Banner(
    text: String,
    icon: ImageVector,
    tone: BannerTone = BannerTone.Info,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
) {
    val scheme = MaterialTheme.colorScheme
    val (container, content) = when (tone) {
        BannerTone.Info -> scheme.tertiaryContainer to scheme.onTertiaryContainer
        BannerTone.Warning -> scheme.secondaryContainer to scheme.onSecondaryContainer
        BannerTone.Error -> scheme.errorContainer to scheme.onErrorContainer
        BannerTone.Success -> scheme.primaryContainer to scheme.onPrimaryContainer
    }
    val row: @Composable () -> Unit = {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 12.dp))
        }
    }
    if (onClick != null) {
        Surface(onClick = onClick, color = container, contentColor = content, shape = MaterialTheme.shapes.small, modifier = modifier.fillMaxWidth(), content = row)
    } else {
        Surface(color = container, contentColor = content, shape = MaterialTheme.shapes.small, modifier = modifier.fillMaxWidth(), content = row)
    }
}

@Composable
fun ErrorBanner(message: String, modifier: Modifier = Modifier) {
    Banner(message, Icons.Outlined.ErrorOutline, BannerTone.Error, modifier)
}

@Composable
fun Pill(text: String, container: Color, content: Color, modifier: Modifier = Modifier) {
    Surface(color = container, contentColor = content, shape = RoundedCornerShape(50), modifier = modifier) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = content, shape = CircleShape, modifier = Modifier.size(7.dp)) {}
            Text(text, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 6.dp))
        }
    }
}

@Composable
fun StatusPill(status: ListingStatus, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val (label, container, content) = when (status) {
        ListingStatus.DRAFT_LOCAL -> Triple(R.string.status_draft_local, scheme.secondaryContainer, scheme.onSecondaryContainer)
        ListingStatus.DRAFT -> Triple(R.string.status_draft, scheme.surfaceVariant, scheme.onSurfaceVariant)
        ListingStatus.PENDING_GRADING -> Triple(R.string.status_pending_grading, scheme.secondaryContainer, scheme.onSecondaryContainer)
        ListingStatus.PENDING_VERIFICATION -> Triple(R.string.status_pending_verification, scheme.secondaryContainer, scheme.onSecondaryContainer)
        ListingStatus.ACTIVE -> Triple(R.string.status_active, scheme.primaryContainer, scheme.onPrimaryContainer)
        ListingStatus.SOLD -> Triple(R.string.status_sold, scheme.tertiaryContainer, scheme.onTertiaryContainer)
        ListingStatus.EXPIRED -> Triple(R.string.status_expired, scheme.surfaceVariant, scheme.onSurfaceVariant)
        ListingStatus.UNKNOWN -> Triple(R.string.status_unknown, scheme.surfaceVariant, scheme.onSurfaceVariant)
    }
    Pill(stringResource(label), container, content, modifier)
}

/** Just the grade ("Grade A"); how sure the photo check was is explained on the detail screen. */
@Composable
fun GradePill(grade: String?, modifier: Modifier = Modifier) {
    if (grade == null) return
    Pill(grade, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, modifier)
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = modifier.padding(top = Dimens.section),
    )
}

@Composable
fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            value,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

/** Grey one-line explanation under a field or section. */
@Composable
fun HelpText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}
