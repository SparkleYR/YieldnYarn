package com.msme.seller.ui.create

import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.errorMessage
import com.msme.seller.core.listing.DraftField
import com.msme.seller.core.listing.DraftValidation
import com.msme.seller.core.listing.IndianStates
import com.msme.seller.core.listing.ListingDraftInput
import com.msme.seller.core.listing.ListingDraftValidator
import com.msme.seller.core.model.BasePrice
import com.msme.seller.core.model.Vertical
import com.msme.seller.data.EvidenceFiles
import com.msme.seller.data.repo.ListingRepository
import com.msme.seller.data.repo.MarketRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

enum class CreateStep(val fields: Set<DraftField>) {
    CATEGORY(setOf(DraftField.VERTICAL)),
    COMMODITY(setOf(DraftField.COMMODITY, DraftField.REGION)),
    QUANTITY(setOf(DraftField.QUANTITY, DraftField.UNIT, DraftField.PRICE)),
    PHOTOS(setOf(DraftField.EVIDENCE)),
    REVIEW(emptySet()),
}

data class CreateListingUiState(
    val step: CreateStep = CreateStep.CATEGORY,
    val verticals: List<Vertical> = emptyList(),
    val verticalsError: String? = null,
    val vertical: Vertical? = null,
    val commodity: String = "",
    val variety: String = "",
    val region: String = "",
    val quantity: String = "",
    val unit: String = "",
    val price: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val photos: List<String> = emptyList(),
    val importingPhotos: Boolean = false,
    val marketPrice: BasePrice? = null,
    val errors: Map<DraftField, String> = emptyMap(),
    val saving: Boolean = false,
    val saved: Boolean = false,
) {
    val input: ListingDraftInput
        get() = ListingDraftInput(
            verticalId = vertical?.id,
            commodityName = commodity,
            subCategory = variety,
            quantity = quantity,
            unit = unit,
            priceSuggested = price,
            locationLat = lat,
            locationLng = lng,
            region = region,
            evidenceCount = photos.size,
        )
}

@HiltViewModel
class CreateListingViewModel @Inject constructor(
    private val savedStateHandle: SavedStateHandle,
    private val listings: ListingRepository,
    private val market: MarketRepository,
    private val evidenceFiles: EvidenceFiles,
) : ViewModel() {
    private val _state = MutableStateFlow(CreateListingUiState())
    val state: StateFlow<CreateListingUiState> = _state.asStateFlow()

    init {
        loadVerticals()
    }

    fun loadVerticals() {
        _state.update { it.copy(verticalsError = null) }
        viewModelScope.launch {
            when (val result = market.verticals()) {
                is ApiResult.Success -> _state.update { it.copy(verticals = result.value) }
                else -> _state.update { it.copy(verticalsError = result.errorMessage) }
            }
        }
    }

    fun selectVertical(vertical: Vertical) = _state.update {
        it.copy(
            vertical = vertical,
            // Default the unit to the category's, unless the seller already typed one.
            unit = if (it.unit.isBlank() || it.unit == it.vertical?.unitOfMeasure) vertical.unitOfMeasure else it.unit,
            errors = it.errors - DraftField.VERTICAL,
        )
    }

    fun onCommodity(value: String) = _state.update { it.copy(commodity = value, errors = it.errors - DraftField.COMMODITY) }
    fun onVariety(value: String) = _state.update { it.copy(variety = value) }
    fun onRegion(value: String) = _state.update { it.copy(region = value, errors = it.errors - DraftField.REGION) }
    fun onQuantity(value: String) = _state.update { it.copy(quantity = value, errors = it.errors - DraftField.QUANTITY) }
    fun onUnit(value: String) = _state.update { it.copy(unit = value, errors = it.errors - DraftField.UNIT) }
    fun onPrice(value: String) = _state.update { it.copy(price = value, errors = it.errors - DraftField.PRICE) }
    fun onLocation(lat: Double, lng: Double) = _state.update { it.copy(lat = lat, lng = lng) }

    fun next() {
        val current = state.value
        val errors = ListingDraftValidator.validateStep(current.step.fields, current.input)
        if (errors.isNotEmpty()) {
            _state.update { it.copy(errors = errors) }
            return
        }
        if (current.step == CreateStep.COMMODITY) fetchMarketPrice()
        val nextStep = CreateStep.entries.getOrNull(current.step.ordinal + 1) ?: return
        _state.update { it.copy(step = nextStep, errors = emptyMap()) }
    }

    /** Returns false when already on the first step (the screen should close). */
    fun back(): Boolean {
        val previous = CreateStep.entries.getOrNull(state.value.step.ordinal - 1) ?: return false
        _state.update { it.copy(step = previous, errors = emptyMap()) }
        return true
    }

    fun goTo(step: CreateStep) = _state.update { it.copy(step = step, errors = emptyMap()) }

    private fun fetchMarketPrice() {
        val slug = state.value.vertical?.slug ?: return
        val commodity = state.value.commodity.takeIf { it.isNotBlank() } ?: return
        val region = IndianStates.normalize(state.value.region).orEmpty()
        viewModelScope.launch {
            _state.update { it.copy(marketPrice = market.basePrice(slug, commodity, region)) }
        }
    }

    // --- photos -------------------------------------------------------------

    /** A file + Uri for the camera app; the path survives process death. */
    fun prepareCapture(): Uri {
        val (file, uri) = evidenceFiles.newCaptureTarget()
        savedStateHandle[PENDING_CAPTURE] = file.absolutePath
        return uri
    }

    fun onCaptureResult(success: Boolean) {
        val path = savedStateHandle.get<String>(PENDING_CAPTURE) ?: return
        savedStateHandle.remove<String>(PENDING_CAPTURE)
        val file = File(path)
        if (!success) {
            file.delete()
            return
        }
        viewModelScope.launch {
            evidenceFiles.finishCapture(file)?.let { addPhotos(listOf(it.absolutePath)) }
        }
    }

    fun importPhotos(uris: List<Uri>) {
        if (uris.isEmpty()) return
        _state.update { it.copy(importingPhotos = true) }
        viewModelScope.launch {
            val room = ListingDraftValidator.MAX_EVIDENCE_PHOTOS - state.value.photos.size
            val imported = uris.take(room).mapNotNull { evidenceFiles.importFromGallery(it)?.absolutePath }
            addPhotos(imported)
            _state.update { it.copy(importingPhotos = false) }
        }
    }

    fun removePhoto(path: String) {
        evidenceFiles.delete(path)
        _state.update { it.copy(photos = it.photos - path) }
    }

    private fun addPhotos(paths: List<String>) = _state.update {
        it.copy(photos = (it.photos + paths).take(ListingDraftValidator.MAX_EVIDENCE_PHOTOS), errors = it.errors - DraftField.EVIDENCE)
    }

    val canAddPhotos: Boolean get() = state.value.photos.size < ListingDraftValidator.MAX_EVIDENCE_PHOTOS

    // --- submit -------------------------------------------------------------

    fun submit() {
        val current = state.value
        if (current.saving || current.saved) return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = listings.createDraft(current.input, current.vertical?.name.orEmpty(), current.photos)
            when (result) {
                is DraftValidation.Valid -> _state.update { it.copy(saving = false, saved = true) }
                is DraftValidation.Invalid -> {
                    val firstBad = CreateStep.entries.first { step -> step.fields.any { it in result.errors } }
                    _state.update { it.copy(saving = false, errors = result.errors, step = firstBad) }
                }
            }
        }
    }

    /** Leaving without saving: don't strand the photos in app storage. */
    fun discard() {
        if (!state.value.saved) state.value.photos.forEach(evidenceFiles::delete)
    }

    private companion object {
        const val PENDING_CAPTURE = "pending_capture_path"
    }
}
