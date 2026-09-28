package com.msme.seller.ui.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.core.listing.ListingStatus
import com.msme.seller.core.model.GradingResult
import com.msme.seller.ui.bids.BidCard
import com.msme.seller.ui.bids.BidsViewModel
import com.msme.seller.ui.components.ErrorState
import com.msme.seller.ui.components.GradePill
import com.msme.seller.ui.components.LabeledValue
import com.msme.seller.ui.components.LoadingBox
import com.msme.seller.ui.components.SectionTitle
import com.msme.seller.ui.components.StatusPill

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingDetailScreen(
    onBack: () -> Unit,
    viewModel: ListingDetailViewModel = hiltViewModel(),
    bidsViewModel: BidsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val bidState by bidsViewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    LaunchedEffect(state.message) {
        state.message?.let { snackbar.showSnackbar(it); viewModel.messageShown() }
    }
    LaunchedEffect(bidState.message) {
        bidState.message?.let { snackbar.showSnackbar(it.resolve(context)); bidsViewModel.messageShown() }
    }
    // A bid decision changes the listing (quantity, SOLD); reload after one.
    LaunchedEffect(bidState.revision) { if (bidState.revision > 0) viewModel.load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.detail?.listing?.commodityName ?: stringResource(R.string.listing_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        val detail = state.detail
        when {
            state.loading && detail == null -> LoadingBox(Modifier.padding(padding))
            detail == null -> ErrorState(state.error.orEmpty(), viewModel::load, Modifier.padding(padding))
            else -> LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                val listing = detail.listing
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        StatusPill(ListingStatus.from(listing.status))
                        GradePill(listing.grade, listing.gradeConfidence)
                    }
                }
                if (detail.evidence.isNotEmpty()) {
                    item {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(detail.evidence, key = { it.id }) { photo ->
                                AsyncImage(
                                    model = photo.file,
                                    contentDescription = stringResource(R.string.evidence_photo),
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(120.dp).clip(RoundedCornerShape(10.dp)),
                                )
                            }
                        }
                    }
                }
                item {
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            LabeledValue(stringResource(R.string.field_quantity), Money.quantity(listing.quantity, listing.unit))
                            LabeledValue(stringResource(R.string.field_your_price), listing.priceSuggested?.let { stringResource(R.string.price_per_unit, Money.rupees(it), listing.unit) } ?: "—")
                            listing.priceFinal?.let {
                                LabeledValue(stringResource(R.string.field_final_price), stringResource(R.string.price_per_unit, Money.rupees(it), listing.unit))
                            }
                            listing.subCategory?.takeIf { it.isNotBlank() }?.let {
                                LabeledValue(stringResource(R.string.field_variety), it)
                            }
                        }
                    }
                }
                item { SectionTitle(stringResource(R.string.grading_section)) }
                val latest = detail.grading.firstOrNull()
                if (latest == null) {
                    item { Text(stringResource(R.string.grading_none), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } else {
                    item { GradingCard(latest, verifierNote = listing.status == ListingStatus.PENDING_VERIFICATION.apiValue) }
                }
                if (listing.status == ListingStatus.PENDING_GRADING.apiValue || listing.status == ListingStatus.DRAFT.apiValue) {
                    item {
                        OutlinedButton(onClick = viewModel::regrade, enabled = !state.regrading, modifier = Modifier.fillMaxWidth()) {
                            Text(stringResource(if (state.regrading) R.string.grading_running else R.string.action_regrade))
                        }
                    }
                }
                item { SectionTitle(stringResource(R.string.bids_section, detail.bids.size)) }
                if (detail.bids.isEmpty()) {
                    item { Text(stringResource(R.string.bids_none_for_listing), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                items(detail.bids, key = { it.id }) { bid ->
                    BidCard(
                        bid = bid,
                        askingPrice = listing.priceSuggested,
                        busy = bid.id in bidState.busyIds,
                        onAccept = { bidsViewModel.accept(bid) },
                        onReject = { bidsViewModel.reject(bid) },
                        onCounter = { price, qty, msg -> bidsViewModel.counter(bid, price, qty, msg) },
                    )
                }
            }
        }
    }
}

@Composable
private fun GradingCard(result: GradingResult, verifierNote: Boolean) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                stringResource(if (result.source == "VERIFIER") R.string.grading_by_verifier else R.string.grading_by_ai),
                style = MaterialTheme.typography.titleSmall,
            )
            result.confidenceScore?.let {
                Text(stringResource(R.string.grading_confidence, (it * 100).toInt()), style = MaterialTheme.typography.bodySmall)
            }
            result.attributeScores.orEmpty().forEach { (name, score) ->
                Column {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name.replace('_', ' ').replaceFirstChar { it.uppercase() }, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        Text("${(score * 100).toInt()}%", style = MaterialTheme.typography.bodyMedium)
                    }
                    LinearProgressIndicator(progress = { score.toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
            if (verifierNote) {
                Text(stringResource(R.string.grading_verifier_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            result.notes?.takeIf { it.isNotBlank() && result.source == "VERIFIER" }?.let {
                Text(stringResource(R.string.grading_verifier_notes, it), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
