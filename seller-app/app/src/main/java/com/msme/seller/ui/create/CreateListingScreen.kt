package com.msme.seller.ui.create

import android.Manifest
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.Checkroom
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Grass
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.MyLocation
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.PopupProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.msme.seller.R
import com.msme.seller.core.format.Money
import com.msme.seller.core.listing.DraftField
import com.msme.seller.core.listing.IndianStates
import com.msme.seller.core.listing.ListingDraftValidator
import com.msme.seller.ui.components.AppCard
import com.msme.seller.ui.components.Banner
import com.msme.seller.ui.components.BannerTone
import com.msme.seller.ui.components.Dimens
import com.msme.seller.ui.components.ErrorState
import com.msme.seller.ui.components.HelpText
import com.msme.seller.ui.components.IconBox
import com.msme.seller.ui.components.LoadingBox
import com.msme.seller.ui.components.PrimaryButton
import com.msme.seller.ui.components.SecondaryButton
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode

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
                title = { Text(stringResource(R.string.create_title), style = MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = {
                    IconButton(onClick = { if (!viewModel.back()) close() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    TextButton(onClick = close) { Text(stringResource(R.string.action_cancel), style = MaterialTheme.typography.labelLarge) }
                },
            )
        },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.surface) {
                Column(Modifier.navigationBarsPadding().imePadding()) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    Box(Modifier.padding(Dimens.screen)) {
                        if (state.step == CreateStep.REVIEW) {
                            PrimaryButton(stringResource(R.string.action_save_listing), onClick = viewModel::submit, busy = state.saving)
                        } else {
                            PrimaryButton(stringResource(R.string.action_next), onClick = viewModel::next)
                        }
                    }
                }
            }
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            Column(Modifier.padding(horizontal = Dimens.screen), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    stringResource(R.string.create_step_of, state.step.ordinal + 1, CreateStep.entries.size),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
                LinearProgressIndicator(
                    progress = { (state.step.ordinal + 1f) / CreateStep.entries.size },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape),
                    trackColor = MaterialTheme.colorScheme.surfaceVariant,
                    strokeCap = StrokeCap.Round,
                    gapSize = 0.dp,
                    drawStopIndicator = {},
                )
            }
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

/** Every step: big question, one-line explanation, then the fields — same spacing on each. */
@Composable
private fun StepColumn(title: String, subtitle: String, content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(Dimens.screen),
        verticalArrangement = Arrangement.spacedBy(Dimens.gap),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Text(subtitle, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

@Composable
private fun FieldError(errors: Map<DraftField, String>, field: DraftField) {
    errors[field]?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
}

@Composable
private fun Field(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    isError: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    prefix: String? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = if (placeholder != null) { { Text(placeholder) } } else null,
        prefix = if (prefix != null) { { Text(prefix) } } else null,
        trailingIcon = trailingIcon,
        isError = isError,
        singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge,
        shape = MaterialTheme.shapes.small,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun CategoryStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    when {
        state.verticals.isEmpty() && state.verticalsError != null -> ErrorState(state.verticalsError, viewModel::loadVerticals)
        state.verticals.isEmpty() -> LoadingBox()
        else -> StepColumn(stringResource(R.string.create_category_title), stringResource(R.string.create_category_subtitle)) {
            state.verticals.forEach { vertical ->
                val selected = state.vertical?.id == vertical.id
                AppCard(Modifier.fillMaxWidth(), onClick = { viewModel.selectVertical(vertical) }, selected = selected) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBox(if (vertical.slug == "textiles") Icons.Outlined.Checkroom else Icons.Outlined.Grass)
                        Column(Modifier.weight(1f).padding(horizontal = Dimens.gap)) {
                            Text(vertical.name, style = MaterialTheme.typography.titleMedium)
                            HelpText(stringResource(R.string.create_sold_by, vertical.unitOfMeasure))
                        }
                        if (selected) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
                        }
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
        Field(
            value = state.commodity,
            onValueChange = viewModel::onCommodity,
            label = stringResource(R.string.field_commodity),
            placeholder = stringResource(R.string.field_commodity_placeholder),
            isError = DraftField.COMMODITY in state.errors,
        )
        FieldError(state.errors, DraftField.COMMODITY)
        Field(
            value = state.variety,
            onValueChange = viewModel::onVariety,
            label = stringResource(R.string.field_variety_optional),
            placeholder = stringResource(R.string.field_variety_placeholder),
        )
        RegionPicker(state.region, viewModel::onRegion, DraftField.REGION in state.errors)
        FieldError(state.errors, DraftField.REGION)
        HelpText(stringResource(R.string.create_region_why))
    }
}

/** Free text with state suggestions, so "rajasthan" or "Chhattisgarh" still map to the price data's spelling. */
@Composable
private fun RegionPicker(value: String, onChange: (String) -> Unit, isError: Boolean) {
    var open by remember { mutableStateOf(false) }
    Box {
        Field(
            value = value,
            onValueChange = {
                onChange(it)
                open = true
            },
            label = stringResource(R.string.field_region),
            placeholder = stringResource(R.string.field_region_placeholder),
            isError = isError,
            trailingIcon = {
                IconButton(onClick = { open = !open }) {
                    Icon(Icons.Outlined.ArrowDropDown, contentDescription = stringResource(R.string.field_region))
                }
            },
        )
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            properties = PopupProperties(focusable = false),
        ) {
            IndianStates.suggest(value).forEach { state ->
                DropdownMenuItem(
                    text = { Text(state, style = MaterialTheme.typography.bodyLarge) },
                    onClick = {
                        onChange(state)
                        open = false
                    },
                )
            }
        }
    }
}

@Composable
private fun QuantityStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    val context = LocalContext.current
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) LastLocation.get(context)?.let { viewModel.onLocation(it.latitude, it.longitude) }
    }
    StepColumn(stringResource(R.string.create_quantity_title), stringResource(R.string.create_quantity_subtitle)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            Field(
                value = state.quantity,
                onValueChange = viewModel::onQuantity,
                label = stringResource(R.string.field_quantity),
                isError = DraftField.QUANTITY in state.errors,
                keyboardType = KeyboardType.Decimal,
                modifier = Modifier.weight(1f),
            )
            Field(
                value = state.unit,
                onValueChange = viewModel::onUnit,
                label = stringResource(R.string.field_unit),
                isError = DraftField.UNIT in state.errors,
                modifier = Modifier.weight(1f),
            )
        }
        FieldError(state.errors, DraftField.QUANTITY)
        FieldError(state.errors, DraftField.UNIT)
        Field(
            value = state.price,
            onValueChange = viewModel::onPrice,
            label = stringResource(R.string.field_price_per_unit, state.unit.ifBlank { stringResource(R.string.field_unit).lowercase() }),
            prefix = "₹",
            isError = DraftField.PRICE in state.errors,
            keyboardType = KeyboardType.Decimal,
        )
        FieldError(state.errors, DraftField.PRICE)
        state.marketPrice?.let { market ->
            AppCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconBox(Icons.Outlined.Storefront)
                    Column(Modifier.weight(1f).padding(start = Dimens.gap)) {
                        Text(
                            stringResource(
                                R.string.create_market_price,
                                Money.rupees(BigDecimal.valueOf(market.basePrice)),
                                state.vertical?.unitOfMeasure.orEmpty(),
                            ),
                            style = MaterialTheme.typography.titleMedium,
                        )
                        HelpText(stringResource(R.string.create_market_price_source, market.source.orEmpty(), market.asOf?.take(10).orEmpty()))
                    }
                }
                SecondaryButton(
                    stringResource(R.string.create_use_market_price),
                    onClick = { viewModel.onPrice(BigDecimal.valueOf(market.basePrice).setScale(2, RoundingMode.HALF_UP).toPlainString()) },
                )
            }
        }
        SecondaryButton(
            text = if (state.lat != null) {
                stringResource(R.string.create_location_set, "%.3f, %.3f".format(state.lat, state.lng))
            } else {
                stringResource(R.string.create_add_location)
            },
            onClick = { locationPermission.launch(Manifest.permission.ACCESS_COARSE_LOCATION) },
            icon = Icons.Outlined.MyLocation,
        )
        HelpText(stringResource(R.string.create_location_why))
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
        Row(horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            PrimaryButton(
                stringResource(R.string.action_take_photo),
                onClick = { camera.launch(viewModel.prepareCapture()) },
                enabled = viewModel.canAddPhotos,
                icon = Icons.Outlined.PhotoCamera,
                modifier = Modifier.weight(1f),
            )
            SecondaryButton(
                stringResource(R.string.action_gallery),
                onClick = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                enabled = viewModel.canAddPhotos,
                icon = Icons.Outlined.PhotoLibrary,
                modifier = Modifier.weight(1f),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            Text(
                stringResource(R.string.create_photo_count, state.photos.size, ListingDraftValidator.MAX_EVIDENCE_PHOTOS),
                style = MaterialTheme.typography.titleSmall,
            )
            if (state.importingPhotos) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.5.dp)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Dimens.gap), verticalArrangement = Arrangement.spacedBy(Dimens.gap)) {
            state.photos.forEach { path ->
                Box {
                    AsyncImage(
                        model = File(path),
                        contentDescription = stringResource(R.string.evidence_photo),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(104.dp).clip(MaterialTheme.shapes.small),
                    )
                    FilledTonalIconButton(
                        onClick = { viewModel.removePhoto(path) },
                        modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(32.dp),
                    ) {
                        Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.action_remove_photo), modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
        FieldError(state.errors, DraftField.EVIDENCE)
        Banner(stringResource(R.string.create_photo_tips), Icons.Outlined.Lightbulb, BannerTone.Warning)
    }
}

@Composable
private fun ReviewStep(state: CreateListingUiState, viewModel: CreateListingViewModel) {
    StepColumn(stringResource(R.string.create_review_title), stringResource(R.string.create_review_subtitle)) {
        AppCard(Modifier.fillMaxWidth()) {
            ReviewRow(stringResource(R.string.field_category), state.vertical?.name.orEmpty()) { viewModel.goTo(CreateStep.CATEGORY) }
            ReviewRow(stringResource(R.string.field_commodity), listOf(state.commodity, state.variety).filter { it.isNotBlank() }.joinToString(" · ")) {
                viewModel.goTo(CreateStep.COMMODITY)
            }
            ReviewRow(stringResource(R.string.field_region), state.region.ifBlank { "—" }) { viewModel.goTo(CreateStep.COMMODITY) }
            ReviewRow(stringResource(R.string.field_quantity), "${state.quantity} ${state.unit}") { viewModel.goTo(CreateStep.QUANTITY) }
            ReviewRow(
                stringResource(R.string.field_your_price),
                ListingDraftValidator.parseAmount(state.price)?.let { stringResource(R.string.price_per_unit, Money.rupees(it), state.unit) }
                    ?: stringResource(R.string.create_price_not_set),
            ) { viewModel.goTo(CreateStep.QUANTITY) }
            ReviewRow(stringResource(R.string.field_photos), state.photos.size.toString(), last = true) { viewModel.goTo(CreateStep.PHOTOS) }
        }
        Banner(stringResource(R.string.create_offline_note), Icons.Outlined.CloudUpload, BannerTone.Info)
    }
}

/** Label above, value below in bold, pencil on the right — tap anywhere to change it. */
@Composable
private fun ReviewRow(label: String, value: String, last: Boolean = false, onEdit: () -> Unit) {
    Column {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                HelpText(label)
                Text(value, style = MaterialTheme.typography.titleMedium)
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Outlined.Edit, contentDescription = stringResource(R.string.action_edit), tint = MaterialTheme.colorScheme.primary)
            }
        }
        if (!last) HorizontalDivider(Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.outlineVariant)
    }
}
