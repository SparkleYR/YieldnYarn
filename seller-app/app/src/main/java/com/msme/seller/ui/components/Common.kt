package com.msme.seller.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.msme.seller.R
import com.msme.seller.core.listing.ListingStatus

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
        Icon(icon, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )
        if (action != null) Box(Modifier.padding(top = 20.dp)) { action() }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    EmptyState(
        icon = Icons.Outlined.ErrorOutline,
        title = stringResource(R.string.error_title),
        body = message,
        modifier = modifier,
        action = { Button(onClick = onRetry) { Text(stringResource(R.string.action_retry)) } },
    )
}

@Composable
fun ErrorBanner(message: String, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, contentDescription = null)
            Text(message, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
fun Pill(text: String, container: Color, content: Color, modifier: Modifier = Modifier) {
    Surface(color = container, contentColor = content, shape = RoundedCornerShape(50), modifier = modifier) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
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

@Composable
fun GradePill(grade: String?, confidence: Double?, modifier: Modifier = Modifier) {
    if (grade == null) return
    val text = if (confidence != null) {
        stringResource(R.string.grade_with_confidence, grade, (confidence * 100).toInt())
    } else {
        grade
    }
    Pill(text, MaterialTheme.colorScheme.primaryContainer, MaterialTheme.colorScheme.onPrimaryContainer, modifier)
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(vertical = 8.dp),
    )
}

@Composable
fun LabeledValue(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}
