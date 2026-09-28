package com.msme.seller.data.repo

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.api.fetchAllPages
import com.msme.seller.core.api.map
import com.msme.seller.core.listing.DraftValidation
import com.msme.seller.core.listing.ListingDraftInput
import com.msme.seller.core.listing.ListingDraftValidator
import com.msme.seller.core.listing.ListingStatus
import com.msme.seller.core.model.Bid
import com.msme.seller.core.model.Evidence
import com.msme.seller.core.model.GradingResult
import com.msme.seller.core.model.Listing
import com.msme.seller.data.EvidenceFiles
import com.msme.seller.data.local.AppDatabase
import com.msme.seller.data.local.CachedListingEntity
import com.msme.seller.data.local.DraftEvidenceEntity
import com.msme.seller.data.local.DraftListingEntity
import com.msme.seller.data.local.DraftSyncState
import com.msme.seller.data.local.DraftWithEvidence
import com.msme.seller.data.local.toEntity
import com.msme.seller.sync.SyncScheduler
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.math.BigDecimal
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** One row in My Listings: either a local draft or the server's listing. */
data class ListingItem(
    val key: String,
    val serverId: Long?,
    val clientUuid: String?,
    val commodityName: String,
    val subCategory: String,
    val quantity: BigDecimal,
    val unit: String,
    val price: BigDecimal?,
    val status: ListingStatus,
    val grade: String?,
    val gradeConfidence: Double?,
    val syncState: DraftSyncState?,
    val syncError: String?,
    val photoPaths: List<String>,
)

data class ListingDetail(
    val listing: Listing,
    val grading: List<GradingResult>,
    val evidence: List<Evidence>,
    val bids: List<Bid>,
)

@Singleton
class ListingRepository @Inject constructor(
    private val api: SellerApi,
    private val db: AppDatabase,
    private val evidenceFiles: EvidenceFiles,
    private val syncScheduler: SyncScheduler,
) {
    val isSyncing: Flow<Boolean> get() = syncScheduler.isSyncing

    fun observeMyListings(): Flow<List<ListingItem>> =
        combine(db.draftDao().observeAll(), db.listingDao().observeAll()) { drafts, listings ->
            drafts.map { it.toItem() } + listings.map { it.toItem() }
        }

    fun observeCached(id: Long): Flow<CachedListingEntity?> = db.listingDao().observe(id)

    /** Pulls the seller's listings from the server into the offline cache. */
    suspend fun refresh(): ApiResult<Unit> =
        fetchAllPages { page -> api.myListings(page = page) }.also { result ->
            if (result is ApiResult.Success) db.listingDao().replaceAll(result.value.map { it.toEntity() })
        }.map { }

    /**
     * Saves the listing on the phone first (works offline), then asks
     * WorkManager to upload it. Returns field errors if the input is invalid.
     */
    suspend fun createDraft(
        input: ListingDraftInput,
        verticalName: String,
        photoPaths: List<String>,
    ): DraftValidation {
        val clientUuid = UUID.randomUUID().toString()
        val validation = ListingDraftValidator.validate(input.copy(evidenceCount = photoPaths.size), clientUuid)
        if (validation !is DraftValidation.Valid) return validation
        val request = validation.request
        db.draftDao().insertWithEvidence(
            DraftListingEntity(
                clientUuid = clientUuid,
                verticalId = request.vertical,
                verticalName = verticalName,
                commodityName = request.commodityName,
                subCategory = request.subCategory,
                quantity = request.quantity,
                unit = request.unit,
                priceSuggested = request.priceSuggested,
                locationLat = request.locationLat,
                locationLng = request.locationLng,
                createdAt = System.currentTimeMillis(),
            ),
            photoPaths.map { DraftEvidenceEntity(draftUuid = clientUuid, path = it) },
        )
        syncScheduler.syncNow()
        return validation
    }

    suspend fun retryDraft(clientUuid: String) {
        db.draftDao().setSyncState(clientUuid, DraftSyncState.PENDING, null)
        syncScheduler.syncNow()
    }

    suspend fun deleteDraft(clientUuid: String) {
        val photos = db.draftDao().evidenceFor(clientUuid)
        db.draftDao().delete(clientUuid)
        photos.forEach { evidenceFiles.delete(it.path) }
    }

    fun syncNow() = syncScheduler.syncNow()

    suspend fun detail(id: Long): ApiResult<ListingDetail> = coroutineScope {
        val listing = async { apiCall { api.listing(id) } }
        val grading = async { apiCall { api.gradingResults(id) } }
        val evidence = async { apiCall { api.evidence(id) } }
        val bids = async { fetchAllPages { page -> api.bids(page = page, listingId = id) } }
        when (val l = listing.await()) {
            is ApiResult.Success -> {
                db.listingDao().upsert(l.value.toEntity())
                ApiResult.Success(
                    ListingDetail(
                        listing = l.value,
                        grading = (grading.await() as? ApiResult.Success)?.value.orEmpty(),
                        evidence = (evidence.await() as? ApiResult.Success)?.value.orEmpty(),
                        bids = (bids.await() as? ApiResult.Success)?.value.orEmpty(),
                    ),
                    l.code,
                )
            }
            is ApiResult.HttpError -> l
            is ApiResult.NetworkError -> l
        }
    }

    /** Re-runs AI grading for a listing already on the server (e.g. after adding photos). */
    suspend fun regrade(id: Long) = apiCall { api.triggerGrading(id) }
}

private fun DraftWithEvidence.toItem() = ListingItem(
    key = "draft-${draft.clientUuid}",
    serverId = draft.serverId,
    clientUuid = draft.clientUuid,
    commodityName = draft.commodityName,
    subCategory = draft.subCategory,
    quantity = draft.quantity,
    unit = draft.unit,
    price = draft.priceSuggested,
    status = ListingStatus.DRAFT_LOCAL,
    grade = null,
    gradeConfidence = null,
    syncState = draft.syncState,
    syncError = draft.lastError,
    photoPaths = evidence.map { it.path },
)

private fun CachedListingEntity.toItem() = ListingItem(
    key = "listing-$id",
    serverId = id,
    clientUuid = clientUuid,
    commodityName = commodityName,
    subCategory = subCategory,
    quantity = quantity,
    unit = unit,
    price = priceFinal ?: priceSuggested,
    status = ListingStatus.from(status),
    grade = grade,
    gradeConfidence = gradeConfidence,
    syncState = null,
    syncError = null,
    photoPaths = emptyList(),
)
