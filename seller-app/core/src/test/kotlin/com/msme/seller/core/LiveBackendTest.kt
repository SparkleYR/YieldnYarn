package com.msme.seller.core

import com.msme.seller.core.api.ApiClient
import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.api.fetchAllPages
import com.msme.seller.core.model.CounterBidRequest
import com.msme.seller.core.model.CreateListingRequest
import com.msme.seller.core.model.DeviceTokenRequest
import com.msme.seller.core.model.LoginRequest
import com.msme.seller.core.model.Profile
import com.msme.seller.core.model.RegisterRequest
import com.msme.seller.core.model.UpdateMeRequest
import com.msme.seller.core.sync.PendingDraft
import com.msme.seller.core.sync.PendingEvidence
import com.msme.seller.core.sync.SyncEngine
import com.msme.seller.core.sync.SyncReport
import com.msme.seller.core.sync.FakeDraftStore
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.math.BigDecimal
import java.util.UUID

/**
 * End-to-end against a real running Django + FastAPI (not run by default):
 *
 *     LIVE_API_URL=http://localhost:8000/api/ ./gradlew :core:test --tests '*LiveBackendTest*'
 *
 * Needs an active vertical with slug "agriculture". Registers throwaway users
 * with random emails, so it's safe to re-run against a dev database.
 */
class LiveBackendTest {
    private val baseUrl = System.getenv("LIVE_API_URL")

    @Test
    fun `seller flow against the real backend`() = runBlocking {
        assumeTrue("set LIVE_API_URL to run", baseUrl != null)
        val tokens = MemoryTokenStore()
        val api = ApiClient.sellerApi(baseUrl!!, tokens)
        val email = "seller-${UUID.randomUUID()}@live-test.example"

        // Register + log in as a SELLER.
        val registered = apiCall { api.register(RegisterRequest(email, "livetest-pass-1", displayName = "Live Test Farms")) }
        assertTrue("register: $registered", registered is ApiResult.Success)
        val pair = (apiCall { api.login(LoginRequest(email, "livetest-pass-1")) } as ApiResult.Success).value
        tokens.accessToken = pair.access
        tokens.refreshToken = pair.refresh
        val me = (apiCall { api.me() } as ApiResult.Success).value
        assertEquals("SELLER", me.role)
        assertEquals("Live Test Farms", me.displayName)

        // Profile edit + device registration.
        val updated = apiCall { api.updateMe(UpdateMeRequest(phone = "+919800000001", profile = Profile(displayName = "Live Farms", preferredLanguage = "hi"))) }
        assertEquals("hi", (updated as ApiResult.Success).value.profile?.preferredLanguage)
        assertTrue(apiCall { api.registerDevice(DeviceTokenRequest("live-test-token-$email")) } is ApiResult.Success)

        val vertical = (fetchAllPages { api.verticals(it) } as ApiResult.Success).value.first { it.slug == "agriculture" }

        // Offline draft -> sync engine -> real listing, photo, grading.
        val photo = File.createTempFile("grain", ".jpg").apply { writeBytes(ByteArray(2048) { (it % 251).toByte() }) }
        val clientUuid = UUID.randomUUID().toString()
        val store = FakeDraftStore(
            listOf(
                PendingDraft(
                    clientUuid,
                    CreateListingRequest(clientUuid, vertical.id, "Wheat", "Sharbati", BigDecimal("40"), vertical.unitOfMeasure, BigDecimal("2450"), 26.91, 75.79),
                    serverId = null,
                    evidence = listOf(PendingEvidence(1, photo)),
                    gradingTriggered = false,
                ),
            ),
        )
        assertEquals(SyncReport(synced = 1), SyncEngine(api, store).syncAll())
        val listing = store.synced.getValue(clientUuid)
        assertEquals(clientUuid, listing.clientUuid)
        assertTrue(listing.status in setOf("ACTIVE", "PENDING_VERIFICATION"))
        assertEquals(1, (apiCall { api.evidence(listing.id) } as ApiResult.Success).value.size)
        assertNotNull((apiCall { api.gradingResults(listing.id) } as ApiResult.Success).value.firstOrNull()?.confidenceScore)

        // A replayed create (lost response) must not duplicate the listing.
        val replay = apiCall { api.createListing(store.drafts.getValue(clientUuid).request) }
        assertEquals(200, (replay as ApiResult.Success).code)
        assertEquals(listing.id, replay.value.id)

        // Bids need an ACTIVE listing; stub grading routes to verification, so
        // approve it through the real verifier endpoint when needed.
        if (listing.status != "ACTIVE") approveAsVerifier(listing.id)

        // A buyer bids; the seller counters; the buyer accepts the counter.
        val buyer = RawClient(baseUrl, "buyer-${UUID.randomUUID()}@live-test.example", "BUYER")
        buyer.post("orders/bids/", """{"listing": ${listing.id}, "offered_price": "2300.00", "offered_quantity": "10.00", "message": "Can do 2300"}""")
        val incoming = (fetchAllPages { api.bids(page = it, listingId = listing.id) } as ApiResult.Success).value.single()
        assertEquals("SELLER", incoming.awaitingResponseFrom)
        assertEquals("Wheat", incoming.commodityName)

        val counter = apiCall { api.counterBid(incoming.id, CounterBidRequest(BigDecimal("2400"), null, "Best price")) }
        val counterBid = (counter as ApiResult.Success).value
        assertEquals("BUYER", counterBid.awaitingResponseFrom)
        buyer.patch("orders/bids/${counterBid.id}/", """{"status": "ACCEPTED"}""")

        val after = (apiCall { api.listing(listing.id) } as ApiResult.Success).value
        assertEquals(0, BigDecimal("30").compareTo(after.quantity))
        val notes = (fetchAllPages { api.notifications(it) } as ApiResult.Success).value
        assertTrue(notes.any { it.title == "Counter-offer accepted" })
    }

    private fun approveAsVerifier(listingId: Long) {
        val verifier = RawClient(baseUrl!!, "verifier-${UUID.randomUUID()}@live-test.example", "VERIFIER")
        verifier.post("verification/queue/$listingId/review/", """{"decision": "APPROVE"}""")
    }

    /** Minimal non-seller client for the buyer/verifier sides of the flow. */
    private class RawClient(private val baseUrl: String, email: String, role: String) {
        private val http = OkHttpClient()
        private val json = "application/json".toMediaType()
        private val token: String

        init {
            send("auth/register/", "POST", """{"email": "$email", "password": "livetest-pass-1", "role": "$role"}""", auth = false)
            val body = send("auth/login/", "POST", """{"email": "$email", "password": "livetest-pass-1"}""", auth = false)
            token = Regex("\"access\"\\s*:\\s*\"([^\"]+)\"").find(body)!!.groupValues[1]
        }

        fun post(path: String, body: String) = send(path, "POST", body)
        fun patch(path: String, body: String) = send(path, "PATCH", body)

        private fun send(path: String, method: String, body: String, auth: Boolean = true): String {
            val request = Request.Builder().url(baseUrl + path).method(method, body.toRequestBody(json))
                .apply { if (auth) header("Authorization", "Bearer $token") }.build()
            http.newCall(request).execute().use { response ->
                val text = response.body!!.string()
                check(response.isSuccessful) { "$method $path -> ${response.code}: $text" }
                return text
            }
        }
    }
}
