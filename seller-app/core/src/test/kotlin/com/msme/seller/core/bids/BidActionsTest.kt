package com.msme.seller.core.bids

import com.msme.seller.core.listing.ListingStatus
import com.msme.seller.core.model.Bid
import com.msme.seller.core.stats.DashboardStats
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigDecimal

class BidActionsTest {
    private fun bid(status: String = "PENDING", awaiting: String? = "SELLER") = Bid(
        id = 1, listing = 2, commodityName = "Wheat", unit = "quintal", buyer = 5, buyerName = "Asha Traders",
        proposedBy = 5, offeredPrice = BigDecimal("2300.00"), offeredQuantity = BigDecimal("10.00"),
        status = status, parentBid = null, message = "", awaitingResponseFrom = awaiting, createdAt = null,
    )

    @Test
    fun `seller acts on a pending bid awaiting them`() = assertTrue(BidActions.forSeller(bid()).canCounter)

    @Test
    fun `seller waits on their own counter-offer`() = assertFalse(BidActions.forSeller(bid(awaiting = "BUYER")).any)

    @Test
    fun `settled bids have no actions`() = assertFalse(BidActions.forSeller(bid(status = "ACCEPTED", awaiting = null)).any)

    @Test
    fun `totals and percent vs asking`() {
        assertEquals(BigDecimal("23000.0000"), BidMath.total(bid()))
        assertEquals(-4.1666, BidMath.percentVsAsking(BigDecimal("2300"), BigDecimal("2400"))!!, 0.001)
    }

    @Test
    fun `dashboard stats`() {
        val stats = DashboardStats.compute(
            listOf(
                DashboardStats.Companion.ListingLike(ListingStatus.ACTIVE, BigDecimal("10"), BigDecimal("2000")),
                DashboardStats.Companion.ListingLike(ListingStatus.ACTIVE, BigDecimal("5"), null),
                DashboardStats.Companion.ListingLike(ListingStatus.PENDING_VERIFICATION, BigDecimal("1"), null),
                DashboardStats.Companion.ListingLike(ListingStatus.DRAFT_LOCAL, BigDecimal("1"), null),
            ),
            listOf(bid(), bid(awaiting = "BUYER")),
        )
        assertEquals(2, stats.activeListings)
        assertEquals(1, stats.pendingGrades)
        assertEquals(1, stats.unsyncedDrafts)
        assertEquals(1, stats.bidsAwaitingYou)
        assertEquals(0, BigDecimal("20000").compareTo(stats.activeStockValue))
    }
}
