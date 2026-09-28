package com.msme.seller.core.api

import com.msme.seller.core.MemoryTokenStore
import com.msme.seller.core.json
import com.msme.seller.core.listingJson
import com.msme.seller.core.model.LoginRequest
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.math.BigDecimal

class ApiClientTest {
    private val server = MockWebServer()
    private lateinit var tokens: MemoryTokenStore
    private lateinit var api: SellerApi

    @Before
    fun setUp() {
        server.start()
        tokens = MemoryTokenStore(accessToken = "old-access", refreshToken = "refresh-1")
        api = ApiClient.sellerApi(server.url("/api/").toString(), tokens)
    }

    @After
    fun tearDown() = server.shutdown()

    @Test
    fun `authenticated calls carry the bearer token and decimals parse`() = runTest {
        server.enqueue(json(listingJson(7)))

        val result = apiCall { api.listing(7) }

        val listing = (result as ApiResult.Success).value
        assertEquals(BigDecimal("25.00"), listing.quantity)
        assertEquals("Bearer old-access", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `login does not send a stale token`() = runTest {
        server.enqueue(json("""{"access": "a", "refresh": "r"}"""))

        apiCall { api.login(LoginRequest("s@example.com", "pw")) }

        assertNull(server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `a 401 refreshes the token pair and retries once`() = runTest {
        server.enqueue(json("""{"detail": "Token is invalid or expired"}""", 401))
        server.enqueue(json("""{"access": "new-access", "refresh": "refresh-2"}"""))
        server.enqueue(json(listingJson(7)))

        val result = apiCall { api.listing(7) }

        assertTrue(result is ApiResult.Success)
        assertEquals("new-access", tokens.accessToken)
        assertEquals("refresh-2", tokens.refreshToken)
        server.takeRequest()
        val refresh = server.takeRequest()
        assertEquals("/api/auth/refresh/", refresh.path)
        assertTrue(refresh.body.readUtf8().contains("refresh-1"))
        assertEquals("Bearer new-access", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `a rejected refresh ends the session`() = runTest {
        server.enqueue(json("""{"detail": "expired"}""", 401))
        server.enqueue(json("""{"detail": "Token is blacklisted"}""", 401))

        val result = apiCall { api.listing(7) }

        assertEquals(401, (result as ApiResult.HttpError).code)
        assertNull(tokens.accessToken)
        assertNull(tokens.refreshToken)
        assertEquals(1, tokens.expiredCalls)
    }

    @Test
    fun `offline is a network error, not an exception`() = runTest {
        server.shutdown()

        val result = apiCall { api.listing(7) }

        assertTrue(result is ApiResult.NetworkError)
    }

    @Test
    fun `pagination follows next links`() = runTest {
        server.enqueue(json("""{"count": 2, "next": "http://x/?page=2", "previous": null, "results": [${listingJson(1)}]}"""))
        server.enqueue(json("""{"count": 2, "next": null, "previous": "http://x/", "results": [${listingJson(2)}]}"""))

        val result = fetchAllPages { page -> api.myListings(page = page) }

        assertEquals(listOf(1L, 2L), (result as ApiResult.Success).value.map { it.id })
        assertTrue(server.takeRequest().path!!.contains("page=1"))
        assertTrue(server.takeRequest().path!!.contains("page=2"))
    }
}

class DrfErrorsTest {
    @Test
    fun `detail wins`() = assertEquals("Nope.", DrfErrors.message("""{"detail": "Nope."}""", 403))

    @Test
    fun `field errors are flattened`() = assertEquals(
        "commodity name: This field is required.\nquantity: A valid number is required.",
        DrfErrors.message(
            """{"commodity_name": ["This field is required."], "quantity": ["A valid number is required."]}""",
            400,
        ),
    )

    @Test
    fun `non field errors drop the label`() = assertEquals(
        "You cannot bid on your own listing.",
        DrfErrors.message("""{"non_field_errors": ["You cannot bid on your own listing."]}""", 400),
    )

    @Test
    fun `html error pages fall back to a friendly message`() =
        assertEquals("The server had a problem. Please try again.", DrfErrors.message("<html>oops</html>", 502))
}
