package com.msme.seller.ui.create

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.core.listing.DraftField
import com.msme.seller.core.listing.ListingDraftValidator
import com.msme.seller.ui.components.ErrorState
import com.msme.seller.ui.components.LabeledValue
import com.msme.seller.ui.components.LoadingBox
import java.io.File
import java.math.BigDecimal

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateListingScreen(onClose: () -> Unit, onSaved: () -> Unit, viewModel: CreateListingViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.saved) { if (state.saved) onSaved() }

    val close = {
        viewModel.discard()
        onClose()
    }
    BackHandler { if (!viewModel.back()) close() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.create_title)) },
                navigationIcon = {
                    IconButton(onClick = { if (!viewModel.back()) close() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    TextButton(onClick = close) { Text(stringResource(R.string.action_cancel)) }
                },
            )
        },
        bottomBar = {
            Column(Modifier.navigationBarsPadding().imePadding().padding(16.dp)) {
                if (state.step == CreateStep.REVIEW) {
                    Button(onClick = viewModel::submit, enabled = !state.saving, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        Text(stringResource(R.string.action_save_listing))
                    }
                } else {
                    Button(onClick = viewModel::next, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        Text(stringResource(R.string.action_next))
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            LinearProgressIndicator(
                progress = { (state.step.ordinal + 1f) / CreateStep.entries.size },
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                stringResource(R.string.create_step_of, state.step.ordinal + 1, CreateStep.entries.size),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 16.dp, top = 12.dp),
            )
            when (state.step) {
                CreateStep.CATEGORY -> CategoryStep(state, viewModel)
                CreateStep.COMMODITY -> CommodityStep(state, viewModel)
                CreateStep.QUANTITY -> QuantityStep(state, viewModel)
                CreateStep.PHOTOS -> PhotosStep(state, viewModel)
                CreateStep.REVIEW -> ReviewStep(state, viewModel)
            }
        }
    }
}

@Composable
private fun StepColumn(title: String, subtitle: String, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
private fun FieldError(errors: Map<DraftField, String>, field: DraftField) {
    errors[field]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
}

@Composable
private fun CategoryStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    when {
        state.verticals.isEmpty() && state.verticalsError != null -> ErrorState(state.verticalsError, viewModel::loadVerticals)
        state.verticals.isEmpty() -> LoadingBox()
        else -> StepColumn(stringResource(R.string.create_category_title), stringResource(R.string.create_category_subtitle)) {
            state.verticals.forEach { vertical ->
                val selected = state.vertical?.id == vertical.id
                Card(
                    modifier = Modifier.fillMaxWidth().clickable { viewModel.selectVertical(vertical) },
                    border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.primary) else null,
                    colors = CardDefaults.cardColors(
                        containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                    ),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(vertical.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            stringResource(R.string.create_sold_by, vertical.unitOfMeasure),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            FieldError(state.errors, DraftField.VERTICAL)
        }
    }
}

@Composable
private fun CommodityStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    StepColumn(stringResource(R.string.create_commodity_title), stringResource(R.string.create_commodity_subtitle)) {
        OutlinedTextField(
            value = state.commodity,
            onValueChange = viewModel::onCommodity,
            label = { Text(stringResource(R.string.field_commodity)) },
            placeholder = { Text(stringResource(R.string.field_commodity_placeholder)) },
            isError = DraftField.COMMODITY in state.errors,
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        FieldError(state.errors, DraftField.COMMODITY)
        OutlinedTextField(
            value = state.variety,
            onValueChange = viewModel::onVariety,
            label = { Text(stringResource(R.string.field_variety_optional)) },
            placeholder = { Text(stringResource(R.string.field_variety_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun QuantityStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    val context = LocalContext.current
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) LastLocation.get(context)?.let { viewModel.onLocation(it.latitude, it.longitude) }
    }
    StepColumn(stringResource(R.string.create_quantity_title), stringResource(R.string.create_quantity_subtitle)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(
                value = state.quantity,
                onValueChange = viewModel::onQuantity,
                label = { Text(stringResource(R.string.field_quantity)) },
                isError = DraftField.QUANTITY in state.errors,
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.weight(1f),
            )
            OutlinedTextField(
                value = state.unit,
                onValueChange = viewModel::onUnit,
                label = { Text(stringResource(R.string.field_unit)) },
                isError = DraftField.UNIT in state.errors,
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
        }
        FieldError(state.errors, DraftField.QUANTITY)
        FieldError(state.errors, DraftField.UNIT)
        OutlinedTextField(
            value = state.price,
            onValueChange = viewModel::onPrice,
            label = { Text(stringResource(R.string.field_price_per_unit, state.unit.ifBlank { "unit" })) },
            prefix = { Text("₹") },
            isError = DraftField.PRICE in state.errors,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.fillMaxWidth(),
        )
        FieldError(state.errors, DraftField.PRICE)
        state.marketPrice?.let { market ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Column(Modifier.padding(12.dp)) {
                    Text(
                        stringResource(
                            R.string.create_market_price,
                            Money.rupees(BigDecimal.valueOf(market.basePrice)),
                            state.vertical?.unitOfMeasure.orEmpty(),
                        ),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Text(
                        stringResource(R.string.create_market_price_source, market.source.orEmpty(), market.asOf?.take(10).orEmpty()),
                        style = MaterialTheme.typography.bodySmall,
                    )
                    TextButton(onClick = { viewModel.onPrice(BigDecimal.valueOf(market.basePrice).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()) }) {
                        Text(stringResource(R.string.create_use_market_price))
                    }
                }
            }
        }
        OutlinedButton(onClick = { locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION) }) {
            Icon(Icons.Outlined.MyLocation, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text(
                if (state.lat != null) {
                    stringResource(R.string.create_location_set, "%.3f, %.3f".format(state.lat, state.lng))
                } else {
                    stringResource(R.string.create_add_location)
                },
            )
        }
        Text(stringResource(R.string.create_location_why), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PhotosStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture(), viewModel::onCaptureResult)
    val remaining = (ListingDraftValidator.MAX_EVIDENCE_PHOTOS - state.photos.size).coerceAtLeast(1)
    val gallery = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = ListingDraftValidator.MAX_EVIDENCE_PHOTOS),
    ) { uris -> viewModel.importPhotos(uris.take(remaining)) }

    StepColumn(stringResource(R.string.create_photos_title), stringResource(R.string.create_photos_subtitle)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { camera.launch(viewModel.prepareCapture()) }, enabled = viewModel.canAddPhotos) {
                Icon(Icons.Outlined.PhotoCamera, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_take_photo))
            }
            OutlinedButton(
                onClick = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                enabled = viewModel.canAddPhotos,
            ) {
                Icon(Icons.Outlined.PhotoLibrary, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_gallery))
            }
        }
        if (state.importingPhotos) CircularProgressIndicator(Modifier.size(24.dp))
        Text(
            stringResource(R.string.create_photo_count, state.photos.size, ListingDraftValidator.MAX_EVIDENCE_PHOTOS),
            style = MaterialTheme.typography.labelMedium,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            state.photos.forEach { path ->
                Box {
                    AsyncImage(
                        model = File(path),
                        contentDescription = stringResource(R.string.evidence_photo),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(104.dp).clip(RoundedCornerShape(10.dp)),
                    )
                    FilledTonalIconButton(
                        onClick = { viewModel.removePhoto(path) },
                        modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp).clip(CircleShape),
                    ) {
                        Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.action_remove_photo), modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
        FieldError(state.errors, DraftField.EVIDENCE)
        Text(stringResource(R.string.create_photo_tips), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReviewStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    StepColumn(stringResource(R.string.create_review_title), stringResource(R.string.create_review_subtitle)) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                ReviewRow(stringResource(R.string.field_category), state.vertical?.name.orEmpty()) { viewModel.goTo(CreateStep.CATEGORY) }
                ReviewRow(stringResource(R.string.field_commodity), listOf(state.commodity, state.variety).filter { it.isNotBlank() }.joinToString(" · ")) {
                    viewModel.goTo(CreateStep.COMMODITY)
                }
                ReviewRow(stringResource(R.string.field_quantity), "${state.quantity} ${state.unit}") { viewModel.goTo(CreateStep.QUANTITY) }
                ReviewRow(
                    stringResource(R.string.field_your_price),
                    ListingDraftValidator.parseAmount(state.price)?.let { stringResource(R.string.price_per_unit, Money.rupees(it), state.unit) }
                        ?: stringResource(R.string.create_price_not_set),
                ) { viewModel.goTo(CreateStep.QUANTITY) }
                ReviewRow(stringResource(R.string.field_photos), state.photos.size.toString()) { viewModel.goTo(CreateStep.PHOTOS) }
            }
        }
        Text(stringResource(R.string.create_offline_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReviewRow(label: String, value: String, onEdit: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onEdit), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { LabeledValue(label, value) }
        TextButton(onClick = onEdit) { Text(stringResource(R.string.action_edit)) }
    }
}
