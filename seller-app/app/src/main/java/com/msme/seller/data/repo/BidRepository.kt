package com.msme.seller.data.repo

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.api.fetchAllPages
import com.msme.seller.core.model.Bid
import com.msme.seller.core.model.BidStatusUpdate
import com.msme.seller.core.model.CounterBidRequest
import java.math.BigDecimal
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BidRepository @Inject constructor(private val api: SellerApi) {
    /** Every bid on the seller's listings (the server scopes this to them). */
    suspend fun all(): ApiResult<List<Bid>> = fetchAllPages { page -> api.bids(page = page) }

    suspend fun accept(bidId: Long) = apiCall { api.updateBidStatus(bidId, BidStatusUpdate("ACCEPTED")) }

    suspend fun reject(bidId: Long) = apiCall { api.updateBidStatus(bidId, BidStatusUpdate("REJECTED")) }

    suspend fun counter(bidId: Long, price: BigDecimal, quantity: BigDecimal?, message: String) =
        apiCall { api.counterBid(bidId, CounterBidRequest(price, quantity, message)) }
}
