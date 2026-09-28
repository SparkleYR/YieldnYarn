package com.msme.seller.core.bids

import com.msme.seller.core.model.Bid
import java.math.BigDecimal

enum class BidStatus { PENDING, ACCEPTED, REJECTED, COUNTERED, EXPIRED, UNKNOWN;
    companion object {
        fun from(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN
    }
}

/** What the seller may do with a bid right now — mirrors the server's rules. */
data class BidActions(val canAccept: Boolean, val canReject: Boolean, val canCounter: Boolean) {
    val any get() = canAccept || canReject || canCounter

    companion object {
        val NONE = BidActions(false, false, false)

        fun forSeller(bid: Bid): BidActions {
            // The server tells us whose move it is; the seller acts only on
            // pending offers made *to* them (a buyer's bid or counter), never
            // on their own outstanding counter-offer.
            val sellersTurn = BidStatus.from(bid.status) == BidStatus.PENDING && bid.awaitingResponseFrom == "SELLER"
            return if (sellersTurn) BidActions(true, true, true) else NONE
        }
    }
}

object BidMath {
    fun total(bid: Bid): BigDecimal = bid.offeredPrice.multiply(bid.offeredQuantity)

    /** Offer vs. the seller's asking price, e.g. -4.2 means 4.2% below asking. */
    fun percentVsAsking(offer: BigDecimal, asking: BigDecimal?): Double? {
        if (asking == null || asking.signum() == 0) return null
        return offer.subtract(asking).toDouble() / asking.toDouble() * 100.0
    }
}
