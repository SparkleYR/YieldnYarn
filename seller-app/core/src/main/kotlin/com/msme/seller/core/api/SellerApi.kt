package com.msme.seller.core.api

import com.msme.seller.core.model.Bid
import com.msme.seller.core.model.BidStatusUpdate
import com.msme.seller.core.model.CounterBidRequest
import com.msme.seller.core.model.CreateListingRequest
import com.msme.seller.core.model.DeviceTokenRequest
import com.msme.seller.core.model.DeviceTokenUnregisterRequest
import com.msme.seller.core.model.Evidence
import com.msme.seller.core.model.GradeResponse
import com.msme.seller.core.model.GradingResult
import com.msme.seller.core.model.Listing
import com.msme.seller.core.model.LoginRequest
import com.msme.seller.core.model.Notification
import com.msme.seller.core.model.Paginated
import com.msme.seller.core.model.RefreshRequest
import com.msme.seller.core.model.RegisterRequest
import com.msme.seller.core.model.TokenPair
import com.msme.seller.core.model.UpdateMeRequest
import com.msme.seller.core.model.User
import com.msme.seller.core.model.Vertical
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

/** Django REST API, relative to `.../api/` (see backend-django/core/urls.py). */
interface SellerApi {
    // --- auth
    @POST("auth/login/")
    suspend fun login(@Body body: LoginRequest): Response<TokenPair>

    @POST("auth/register/")
    suspend fun register(@Body body: RegisterRequest): Response<Unit>

    @POST("auth/refresh/")
    suspend fun refresh(@Body body: RefreshRequest): Response<TokenPair>

    @GET("auth/me/")
    suspend fun me(): Response<User>

    @PATCH("auth/me/")
    suspend fun updateMe(@Body body: UpdateMeRequest): Response<User>

    // --- config
    @GET("config/verticals/")
    suspend fun verticals(@Query("page") page: Int = 1): Response<Paginated<Vertical>>

    // --- catalog (a seller only ever sees their own listings here)
    @GET("catalog/listings/")
    suspend fun myListings(
        @Query("page") page: Int = 1,
        @Query("status") status: String? = null,
    ): Response<Paginated<Listing>>

    @GET("catalog/listings/{id}/")
    suspend fun listing(@Path("id") id: Long): Response<Listing>

    /** Idempotent on `client_uuid`: 201 on first create, 200 with the existing row on replay. */
    @POST("catalog/listings/")
    suspend fun createListing(@Body body: CreateListingRequest): Response<Listing>

    @Multipart
    @POST("catalog/listings/{id}/evidence/")
    suspend fun uploadEvidence(
        @Path("id") listingId: Long,
        @Part file: MultipartBody.Part,
        @Part("file_type") fileType: RequestBody,
    ): Response<Evidence>

    @GET("catalog/listings/{id}/evidence/")
    suspend fun evidence(@Path("id") listingId: Long): Response<List<Evidence>>

    @GET("catalog/listings/{id}/grading/")
    suspend fun gradingResults(@Path("id") listingId: Long): Response<List<GradingResult>>

    @POST("catalog/listings/{id}/grading/trigger/")
    suspend fun triggerGrading(@Path("id") listingId: Long): Response<GradeResponse>

    // --- bids
    @GET("orders/bids/")
    suspend fun bids(
        @Query("page") page: Int = 1,
        @Query("listing") listingId: Long? = null,
        @Query("status") status: String? = null,
    ): Response<Paginated<Bid>>

    @PATCH("orders/bids/{id}/")
    suspend fun updateBidStatus(@Path("id") bidId: Long, @Body body: BidStatusUpdate): Response<Bid>

    @POST("orders/bids/{id}/counter/")
    suspend fun counterBid(@Path("id") bidId: Long, @Body body: CounterBidRequest): Response<Bid>

    // --- notifications
    @GET("notifications/")
    suspend fun notifications(@Query("page") page: Int = 1): Response<Paginated<Notification>>

    @POST("notifications/{id}/read/")
    suspend fun markNotificationRead(@Path("id") id: Long): Response<Notification>

    @POST("notifications/read-all/")
    suspend fun markAllNotificationsRead(): Response<Unit>

    @POST("notifications/devices/")
    suspend fun registerDevice(@Body body: DeviceTokenRequest): Response<Unit>

    @POST("notifications/devices/unregister/")
    suspend fun unregisterDevice(@Body body: DeviceTokenUnregisterRequest): Response<Unit>
}

/** FastAPI compute API, relative to `.../compute/`. Public, no auth. */
interface PricingApi {
    @GET("pricing/base")
    suspend fun basePrice(
        @Query("vertical") verticalSlug: String,
        @Query("commodity") commodity: String,
        @Query("region") region: String? = null,
    ): Response<com.msme.seller.core.model.BasePrice>
}
