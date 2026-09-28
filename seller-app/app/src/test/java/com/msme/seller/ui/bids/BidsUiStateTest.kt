package com.msme.seller.ui.bids

import com.msme.seller.core.model.Bid
import org.junit.Assert.assertEquals
import org.junit.Test
import java.math.BigDecimal

class BidsUiStateTest {
    private fun bid(id: Long, status: String, awaiting: String?) = Bid(
        id = id, listing = 1, commodityName = "Wheat", unit = "quintal", buyer = 9, buyerName = "Asha",
        proposedBy = 9, offeredPrice = BigDecimal("2300"), offeredQuantity = BigDecimal("10"),
        status = status, parentBid = null, message = null, awaitingResponseFrom = awaiting, createdAt = null,
    )

    private val bids = listOf(
        bid(1, "PENDING", "SELLER"),
        bid(2, "PENDING", "BUYER"),
        bid(3, "ACCEPTED", null),
        bid(4, "COUNTERED", null),
    )

    @Test
    fun `tabs split bids by whose move it is`() {
        assertEquals(listOf(1L), BidsUiState(bids = bids, tab = BidTab.NEEDS_YOU).visible.map { it.id })
        assertEquals(listOf(2L), BidsUiState(bids = bids, tab = BidTab.WAITING_ON_BUYER).visible.map { it.id })
        assertEquals(listOf(3L, 4L), BidsUiState(bids = bids, tab = BidTab.CLOSED).visible.map { it.id })
    }
}
