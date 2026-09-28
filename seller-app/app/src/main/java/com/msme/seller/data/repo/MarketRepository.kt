package com.msme.seller.data.repo

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.PricingApi
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.api.fetchAllPages
import com.msme.seller.core.model.BasePrice
import com.msme.seller.core.model.Vertical
import javax.inject.Inject
import javax.inject.Singleton

/** Verticals (categories) and market price hints for the Create Listing flow. */
@Singleton
class MarketRepository @Inject constructor(private val api: SellerApi, private val pricing: PricingApi) {
    @Volatile
    private var cachedVerticals: List<Vertical>? = null

    suspend fun verticals(): ApiResult<List<Vertical>> {
        cachedVerticals?.let { return ApiResult.Success(it, 200) }
        return fetchAllPages { page -> api.verticals(page) }.also { result ->
            if (result is ApiResult.Success) cachedVerticals = result.value.filter { it.isActive }
        }.let { result -> if (result is ApiResult.Success) ApiResult.Success(cachedVerticals!!, 200) else result }
    }

    /** Latest market price (Agmarknet / admin-entered), or null when there's no data. */
    suspend fun basePrice(verticalSlug: String, commodity: String): BasePrice? =
        (apiCall { pricing.basePrice(verticalSlug, commodity.trim()) } as? ApiResult.Success)?.value
}
