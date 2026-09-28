package com.msme.seller.core.api

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.msme.seller.core.model.RefreshRequest
import com.msme.seller.core.model.TokenPair
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import java.util.concurrent.TimeUnit

/** Where the JWT pair lives (SharedPreferences on the device, memory in tests). */
interface TokenStore {
    var accessToken: String?
    var refreshToken: String?

    /** Called when the refresh token itself is rejected — the user must log in again. */
    fun onSessionExpired()
}

object ApiClient {
    // Nulls are omitted, not sent: every nullable request field is optional
    // server-side, and e.g. PATCH /auth/me/ must not send `avatar_url: null`
    // (a URLField rejects null) just because the app never set it.
    val gson: Gson = GsonBuilder().create()

    fun sellerApi(baseUrl: String, tokens: TokenStore, configure: OkHttpClient.Builder.() -> Unit = {}): SellerApi {
        val client = baseClient(configure)
            .addInterceptor(AuthInterceptor(tokens))
            .authenticator(TokenRefreshAuthenticator(baseUrl, tokens, baseClient(configure).build()))
            .build()
        return retrofit(baseUrl, client).create(SellerApi::class.java)
    }

    fun pricingApi(baseUrl: String, configure: OkHttpClient.Builder.() -> Unit = {}): PricingApi =
        retrofit(baseUrl, baseClient(configure).build()).create(PricingApi::class.java)

    private fun baseClient(configure: OkHttpClient.Builder.() -> Unit) = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        // Evidence uploads and grading (synchronous inference) can be slow on
        // rural connections.
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .apply(configure)

    private fun retrofit(baseUrl: String, client: OkHttpClient) = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create(gson))
        .build()
}

private val PUBLIC_PATHS = listOf("auth/login/", "auth/register/", "auth/refresh/")

private fun Request.isPublic() = PUBLIC_PATHS.any { url.encodedPath.endsWith(it) }

internal class AuthInterceptor(private val tokens: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val access = tokens.accessToken
        if (access == null || request.isPublic()) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $access").build())
    }
}

private interface RefreshService {
    @POST("auth/refresh/")
    fun refresh(@Body body: RefreshRequest): retrofit2.Call<TokenPair>
}

/**
 * On a 401, trades the refresh token for a new pair (SimpleJWT rotates the
 * refresh token too) and retries once. If refreshing fails, the session is
 * over and [TokenStore.onSessionExpired] is called.
 */
internal class TokenRefreshAuthenticator(
    baseUrl: String,
    private val tokens: TokenStore,
    refreshClient: OkHttpClient,
) : Authenticator {
    private val service = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(refreshClient)
        .addConverterFactory(GsonConverterFactory.create(ApiClient.gson))
        .build()
        .create(RefreshService::class.java)

    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.isPublic()) return null
        // Already retried once with a fresh token and still 401: give up.
        if (response.priorResponse != null) return null

        synchronized(this) {
            val sentToken = response.request.header("Authorization")?.removePrefix("Bearer ")
            val current = tokens.accessToken
            // Another request already refreshed while this one was in flight.
            if (current != null && current != sentToken) {
                return response.request.newBuilder().header("Authorization", "Bearer $current").build()
            }

            val refresh = tokens.refreshToken ?: return expire()
            val result = try {
                service.refresh(RefreshRequest(refresh)).execute()
            } catch (e: java.io.IOException) {
                return null // offline: fail this request, keep the session
            }
            val pair = result.body()
            if (!result.isSuccessful || pair == null) return expire()

            tokens.accessToken = pair.access
            pair.refresh?.let { tokens.refreshToken = it }
            return response.request.newBuilder().header("Authorization", "Bearer ${pair.access}").build()
        }
    }

    private fun expire(): Request? {
        tokens.accessToken = null
        tokens.refreshToken = null
        tokens.onSessionExpired()
        return null
    }
}
