package com.msme.seller.core.listing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class ListingDraftValidatorTest {
    private val valid = ListingDraftInput(
        verticalId = 1, commodityName = " Wheat ", quantity = "1,250.5", unit = "quintal",
        priceSuggested = "2400", evidenceCount = 2,
    )

    @Test
    fun `valid input becomes a create request with the given client uuid`() {
        val result = ListingDraftValidator.validate(valid, clientUuid = "abc") as DraftValidation.Valid
        assertEquals("abc", result.request.clientUuid)
        assertEquals("Wheat", result.request.commodityName)
        assertEquals(BigDecimal("1250.5"), result.request.quantity)
        assertEquals(BigDecimal("2400"), result.request.priceSuggested)
    }

    @Test
    fun `price is optional`() {
        val result = ListingDraftValidator.validate(valid.copy(priceSuggested = "")) as DraftValidation.Valid
        assertNull(result.request.priceSuggested)
    }

    @Test
    fun `every problem is reported against its field`() {
        val result = ListingDraftValidator.validate(
            ListingDraftInput(verticalId = null, commodityName = "", quantity = "0", unit = "", priceSuggested = "abc"),
        ) as DraftValidation.Invalid
        assertEquals(
            setOf(DraftField.VERTICAL, DraftField.COMMODITY, DraftField.QUANTITY, DraftField.UNIT, DraftField.PRICE, DraftField.EVIDENCE),
            result.errors.keys,
        )
    }

    @Test
    fun `step validation only reports that step's fields`() {
        val errors = ListingDraftValidator.validateStep(
            setOf(DraftField.QUANTITY, DraftField.UNIT),
            valid.copy(quantity = "12.345", commodityName = ""),
        )
        assertEquals(setOf(DraftField.QUANTITY), errors.keys)
    }

    @Test
    fun `amount parsing`() {
        assertEquals(BigDecimal("12"), ListingDraftValidator.parseAmount("12"))
        assertEquals(BigDecimal("1200000"), ListingDraftValidator.parseAmount("12,00,000"))
        assertNull(ListingDraftValidator.parseAmount("1.234"))
        assertNull(ListingDraftValidator.parseAmount("1e5"))
    }

    @Test
    fun `too many photos`() {
        val errors = ListingDraftValidator.validateStep(setOf(DraftField.EVIDENCE), valid.copy(evidenceCount = 7))
        assertTrue(DraftField.EVIDENCE in errors)
    }

    @Test
    fun `filters group statuses`() {
        assertTrue(ListingFilter.DRAFT.matches(ListingStatus.DRAFT_LOCAL))
        assertTrue(ListingFilter.PENDING.matches(ListingStatus.PENDING_VERIFICATION))
        assertEquals(ListingStatus.UNKNOWN, ListingStatus.from("SOMETHING_NEW"))
    }
}
