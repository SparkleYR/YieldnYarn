package com.msme.seller.core.stats

import com.msme.seller.core.bids.BidActions
import com.msme.seller.core.listing.ListingStatus
import com.msme.seller.core.model.Bid
import java.math.BigDecimal

/** Dashboard quick stats (§8.2), computed from data the app already has. */
data class DashboardStats(
    val activeListings: Int,
    val pendingGrades: Int,
    val unsyncedDrafts: Int,
    val bidsAwaitingYou: Int,
    val activeStockValue: BigDecimal,
) {
    companion object {
        data class ListingLike(val status: ListingStatus, val quantity: BigDecimal, val price: BigDecimal?)

        fun compute(listings: List<ListingLike>, bids: List<Bid>): DashboardStats = DashboardStats(
            activeListings = listings.count { it.status == ListingStatus.ACTIVE },
            pendingGrades = listings.count {
                it.status == ListingStatus.PENDING_GRADING || it.status == ListingStatus.PENDING_VERIFICATION
            },
            unsyncedDrafts = listings.count { it.status == ListingStatus.DRAFT_LOCAL },
            bidsAwaitingYou = bids.count { BidActions.forSeller(it).any },
            activeStockValue = listings
                .filter { it.status == ListingStatus.ACTIVE && it.price != null }
                .fold(BigDecimal.ZERO) { sum, l -> sum + l.price!!.multiply(l.quantity) },
        )
    }
}
