package com.msme.seller.core.api

import com.msme.seller.core.model.Paginated
import retrofit2.Response

/** Follows DRF page-number pagination until `next` is null (capped for safety). */
suspend fun <T> fetchAllPages(
    maxPages: Int = 20,
    fetch: suspend (page: Int) -> Response<Paginated<T>>,
): ApiResult<List<T>> {
    val items = mutableListOf<T>()
    var page = 1
    while (page <= maxPages) {
        when (val result = apiCall { fetch(page) }) {
            is ApiResult.Success -> {
                items += result.value.results
                if (result.value.next == null) return ApiResult.Success(items, result.code)
            }
            is ApiResult.HttpError -> return result
            is ApiResult.NetworkError -> return result
        }
        page++
    }
    return ApiResult.Success(items, 200)
}
