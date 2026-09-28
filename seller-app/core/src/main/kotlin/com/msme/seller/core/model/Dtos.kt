package com.msme.seller.core.model

import com.google.gson.annotations.SerializedName
import java.math.BigDecimal

// Wire types for the Django (`/api/...`) and FastAPI (`/compute/...`) APIs.
// DRF serializes DecimalFields as strings ("25.00"); Gson reads those straight
// into BigDecimal. Fields the backend can send as null are nullable here —
// Gson bypasses Kotlin constructors, so a non-null type is no guarantee.

data class Paginated<T>(
    val count: Int,
    val next: String?,
    val previous: String?,
    val results: List<T>,
)

// --- auth ---------------------------------------------------------------

data class LoginRequest(val email: String, val password: String)

data class TokenPair(val access: String, val refresh: String?)

data class RefreshRequest(val refresh: String)

data class RegisterRequest(
    val email: String,
    val password: String,
    val phone: String = "",
    val role: String = Role.SELLER,
    @SerializedName("display_name") val displayName: String = "",
)

object Role {
    const val SELLER = "SELLER"
}

data class Profile(
    @SerializedName("display_name") val displayName: String? = null,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
    @SerializedName("preferred_language") val preferredLanguage: String? = null,
    @SerializedName("location_lat") val locationLat: Double? = null,
    @SerializedName("location_lng") val locationLng: Double? = null,
)

data class User(
    val id: Long,
    val email: String,
    val phone: String?,
    val role: String,
    @SerializedName("is_active") val isActive: Boolean,
    val profile: Profile?,
) {
    val displayName: String get() = profile?.displayName?.takeIf { it.isNotBlank() } ?: email
}

data class UpdateMeRequest(
    val phone: String? = null,
    val profile: Profile? = null,
)

data class DeviceTokenRequest(val token: String, val platform: String = "ANDROID")

data class DeviceTokenUnregisterRequest(val token: String)

// --- config -------------------------------------------------------------

data class Vertical(
    val id: Long,
    val name: String,
    val slug: String,
    @SerializedName("unit_of_measure") val unitOfMeasure: String,
    @SerializedName("is_active") val isActive: Boolean,
)

// --- catalog ------------------------------------------------------------

data class CreateListingRequest(
    @SerializedName("client_uuid") val clientUuid: String,
    val vertical: Long,
    @SerializedName("commodity_name") val commodityName: String,
    @SerializedName("sub_category") val subCategory: String,
    val quantity: BigDecimal,
    val unit: String,
    @SerializedName("price_suggested") val priceSuggested: BigDecimal?,
    @SerializedName("location_lat") val locationLat: Double?,
    @SerializedName("location_lng") val locationLng: Double?,
    /** State name, matched against price_points.region for local pricing. */
    val region: String = "",
)

data class Listing(
    val id: Long,
    @SerializedName("client_uuid") val clientUuid: String?,
    val seller: Long,
    val vertical: Long,
    @SerializedName("commodity_name") val commodityName: String,
    @SerializedName("sub_category") val subCategory: String?,
    val quantity: BigDecimal,
    val unit: String,
    @SerializedName("price_suggested") val priceSuggested: BigDecimal?,
    @SerializedName("price_final") val priceFinal: BigDecimal?,
    @SerializedName("location_lat") val locationLat: Double?,
    @SerializedName("location_lng") val locationLng: Double?,
    val region: String?,
    val status: String,
    val grade: String?,
    @SerializedName("grade_confidence") val gradeConfidence: Double?,
    @SerializedName("created_at") val createdAt: String?,
    @SerializedName("updated_at") val updatedAt: String?,
)

data class Evidence(
    val id: Long,
    val listing: Long,
    val file: String,
    @SerializedName("file_type") val fileType: String,
    @SerializedName("uploaded_at") val uploadedAt: String?,
)

data class GradingResult(
    val id: Long,
    val source: String,
    @SerializedName("confidence_score") val confidenceScore: Double?,
    @SerializedName("attribute_scores") val attributeScores: Map<String, Double>?,
    @SerializedName("created_at") val createdAt: String?,
    val notes: String?,
)

data class GradeResponse(
    @SerializedName("listing_id") val listingId: Long,
    @SerializedName("overall_confidence") val overallConfidence: Double?,
    @SerializedName("needs_verification") val needsVerification: Boolean,
    val grade: String?,
    val method: String?,
)

// --- bids ---------------------------------------------------------------

data class Bid(
    val id: Long,
    val listing: Long,
    @SerializedName("commodity_name") val commodityName: String?,
    val unit: String?,
    val buyer: Long,
    @SerializedName("buyer_name") val buyerName: String?,
    @SerializedName("proposed_by") val proposedBy: Long?,
    @SerializedName("offered_price") val offeredPrice: BigDecimal,
    @SerializedName("offered_quantity") val offeredQuantity: BigDecimal,
    val status: String,
    @SerializedName("parent_bid") val parentBid: Long?,
    val message: String?,
    @SerializedName("awaiting_response_from") val awaitingResponseFrom: String?,
    @SerializedName("created_at") val createdAt: String?,
)

data class BidStatusUpdate(val status: String)

data class CounterBidRequest(
    @SerializedName("offered_price") val offeredPrice: BigDecimal,
    @SerializedName("offered_quantity") val offeredQuantity: BigDecimal?,
    val message: String = "",
)

// --- notifications ------------------------------------------------------

data class Notification(
    val id: Long,
    val type: String,
    val title: String,
    val message: String?,
    @SerializedName("related_object_type") val relatedObjectType: String?,
    @SerializedName("related_object_id") val relatedObjectId: Long?,
    @SerializedName("is_read") val isRead: Boolean,
    @SerializedName("created_at") val createdAt: String?,
)

// --- FastAPI pricing ----------------------------------------------------

data class BasePrice(
    val commodity: String,
    val region: String?,
    @SerializedName("base_price") val basePrice: Double,
    val source: String?,
    @SerializedName("as_of") val asOf: String?,
)
