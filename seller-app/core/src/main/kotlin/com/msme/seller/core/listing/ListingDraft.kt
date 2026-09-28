package com.msme.seller.core.listing

import com.msme.seller.core.model.CreateListingRequest
import java.math.BigDecimal
import java.util.UUID

/** What the seller fills in on the Create Listing form, before validation. */
data class ListingDraftInput(
    val verticalId: Long?,
    val commodityName: String,
    val subCategory: String = "",
    val quantity: String,
    val unit: String,
    val priceSuggested: String = "",
    val locationLat: Double? = null,
    val locationLng: Double? = null,
    val region: String = "",
    val evidenceCount: Int = 0,
)

enum class DraftField { VERTICAL, COMMODITY, REGION, QUANTITY, UNIT, PRICE, EVIDENCE }

sealed interface DraftValidation {
    data class Valid(val request: CreateListingRequest) : DraftValidation
    data class Invalid(val errors: Map<DraftField, String>) : DraftValidation
}

object ListingDraftValidator {
    const val MAX_EVIDENCE_PHOTOS = 6
    private val MAX_QUANTITY = BigDecimal("9999999999.99") // Listing.quantity max_digits=12, decimal_places=2

    /** Validates one step of the multi-step form, so each step can block "Next". */
    fun validateStep(step: Set<DraftField>, input: ListingDraftInput): Map<DraftField, String> =
        errors(input).filterKeys { it in step }

    fun validate(input: ListingDraftInput, clientUuid: String = UUID.randomUUID().toString()): DraftValidation {
        val errors = errors(input)
        if (errors.isNotEmpty()) return DraftValidation.Invalid(errors)
        return DraftValidation.Valid(
            CreateListingRequest(
                clientUuid = clientUuid,
                vertical = input.verticalId!!,
                commodityName = input.commodityName.trim(),
                subCategory = input.subCategory.trim(),
                quantity = parseAmount(input.quantity)!!,
                unit = input.unit.trim(),
                priceSuggested = input.priceSuggested.takeIf { it.isNotBlank() }?.let(::parseAmount),
                locationLat = input.locationLat,
                locationLng = input.locationLng,
                region = IndianStates.normalize(input.region).orEmpty(),
            ),
        )
    }

    private fun errors(input: ListingDraftInput): Map<DraftField, String> = buildMap {
        if (input.verticalId == null) put(DraftField.VERTICAL, "Choose a category")
        when {
            input.commodityName.isBlank() -> put(DraftField.COMMODITY, "Enter the commodity, e.g. Wheat")
            input.commodityName.trim().length > 150 -> put(DraftField.COMMODITY, "Keep it under 150 characters")
        }
        val quantity = parseAmount(input.quantity)
        when {
            input.quantity.isBlank() -> put(DraftField.QUANTITY, "Enter a quantity")
            quantity == null -> put(DraftField.QUANTITY, "Enter a number, e.g. 25 or 12.5")
            quantity.signum() <= 0 -> put(DraftField.QUANTITY, "Quantity must be more than zero")
            quantity > MAX_QUANTITY -> put(DraftField.QUANTITY, "That quantity is too large")
        }
        if (input.region.isNotBlank() && IndianStates.normalize(input.region) == null) {
            put(DraftField.REGION, "Pick your state from the list")
        }
        if (input.unit.isBlank()) put(DraftField.UNIT, "Enter a unit")
        if (input.priceSuggested.isNotBlank()) {
            val price = parseAmount(input.priceSuggested)
            when {
                price == null -> put(DraftField.PRICE, "Enter a price in rupees, e.g. 2400")
                price.signum() < 0 -> put(DraftField.PRICE, "Price can't be negative")
            }
        }
        when {
            input.evidenceCount == 0 -> put(DraftField.EVIDENCE, "Add at least one photo so your produce can be graded")
            input.evidenceCount > MAX_EVIDENCE_PHOTOS -> put(DraftField.EVIDENCE, "Up to $MAX_EVIDENCE_PHOTOS photos")
        }
    }

    /** Accepts "25", "25.5", "1,200" (Indian digit grouping); at most 2 decimals. */
    fun parseAmount(raw: String): BigDecimal? {
        val cleaned = raw.trim().replace(",", "")
        if (!cleaned.matches(Regex("""-?\d+(\.\d{1,2})?"""))) return null
        return cleaned.toBigDecimal()
    }
}
