package com.msme.seller.core

import com.msme.seller.core.api.TokenStore
import okhttp3.mockwebserver.MockResponse

class MemoryTokenStore(
    override var accessToken: String? = null,
    override var refreshToken: String? = null,
) : TokenStore {
    var expiredCalls = 0
    override fun onSessionExpired() {
        expiredCalls++
    }
}

fun json(body: String, code: Int = 200): MockResponse =
    MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body.trimIndent())

fun listingJson(id: Long, status: String = "PENDING_GRADING", clientUuid: String = "uuid-$id") = """
    {"id": $id, "client_uuid": "$clientUuid", "seller": 3, "vertical": 1, "commodity_name": "Wheat",
     "sub_category": "", "quantity": "25.00", "unit": "quintal", "price_suggested": "2400.00",
     "price_final": null, "location_lat": null, "location_lng": null, "status": "$status",
     "grade": null, "grade_confidence": null, "created_at": "2026-09-28T10:00:00Z",
     "updated_at": "2026-09-28T10:00:00Z"}
"""
