package com.msme.seller.core.sync

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.model.CreateListingRequest
import com.msme.seller.core.model.Listing
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

/** A listing drafted on the phone that still has sync work left. */
data class PendingDraft(
    val clientUuid: String,
    val request: CreateListingRequest,
    /** Set once the server has accepted the listing, so retries skip creation. */
    val serverId: Long?,
    val evidence: List<PendingEvidence>,
    val gradingTriggered: Boolean,
)

data class PendingEvidence(val id: Long, val file: File, val mimeType: String = "image/jpeg")

/**
 * Local persistence the sync engine drives — Room on the device, an in-memory
 * fake in tests. Each call records progress durably, so a sync interrupted at
 * any point (app killed, connection lost) resumes where it stopped.
 */
interface DraftStore {
    suspend fun pendingDrafts(): List<PendingDraft>
    suspend fun recordServerId(clientUuid: String, serverId: Long)
    suspend fun markEvidenceUploaded(evidenceId: Long)
    suspend fun markGradingTriggered(clientUuid: String)

    /** Server wins: replace the local copy with what the server now holds. */
    suspend fun markSynced(clientUuid: String, serverListing: Listing)
    suspend fun markFailed(clientUuid: String, error: String, retryable: Boolean)
}

data class SyncReport(val synced: Int = 0, val retryableFailures: Int = 0, val permanentFailures: Int = 0) {
    val shouldRetry: Boolean get() = retryableFailures > 0
    operator fun plus(other: SyncReport) = SyncReport(
        synced + other.synced,
        retryableFailures + other.retryableFailures,
        permanentFailures + other.permanentFailures,
    )
}

/**
 * Offline-first upload flow (implementation_plan.md §8.3), per draft:
 *   1. create the listing (idempotent on client_uuid, so a retry after a
 *      lost response can't duplicate it)
 *   2. upload each not-yet-uploaded evidence photo
 *   3. trigger grading
 *   4. fetch the listing back and store the server's version (server wins)
 *
 * Network failures and 5xx/429 are retryable (WorkManager backs off and
 * retries); other 4xx are permanent (the draft needs the seller's attention).
 */
class SyncEngine(private val api: SellerApi, private val store: DraftStore) {

    suspend fun syncAll(): SyncReport =
        store.pendingDrafts().fold(SyncReport()) { report, draft -> report + syncOne(draft) }

    suspend fun syncOne(draft: PendingDraft): SyncReport {
        val serverId = draft.serverId ?: when (val created = apiCall { api.createListing(draft.request) }) {
            is ApiResult.Success -> created.value.id.also { store.recordServerId(draft.clientUuid, it) }
            else -> return fail(draft, "Couldn't create the listing", created)
        }

        for (evidence in draft.evidence) {
            if (!evidence.file.exists()) {
                // The photo was deleted from the phone; nothing to upload, and
                // blocking the listing forever on it would help no one.
                store.markEvidenceUploaded(evidence.id)
                continue
            }
            val uploaded = apiCall {
                api.uploadEvidence(
                    serverId,
                    MultipartBody.Part.createFormData(
                        "file",
                        evidence.file.name,
                        evidence.file.asRequestBody(evidence.mimeType.toMediaType()),
                    ),
                    "IMAGE".toRequestBody("text/plain".toMediaType()),
                )
            }
            if (uploaded !is ApiResult.Success) return fail(draft, "Couldn't upload a photo", uploaded)
            store.markEvidenceUploaded(evidence.id)
        }

        if (!draft.gradingTriggered) {
            val graded = apiCall { api.triggerGrading(serverId) }
            if (graded !is ApiResult.Success) return fail(draft, "Couldn't start grading", graded)
            store.markGradingTriggered(draft.clientUuid)
        }

        return when (val fetched = apiCall { api.listing(serverId) }) {
            is ApiResult.Success -> {
                store.markSynced(draft.clientUuid, fetched.value)
                SyncReport(synced = 1)
            }
            else -> fail(draft, "Couldn't refresh the listing", fetched)
        }
    }

    private suspend fun fail(draft: PendingDraft, what: String, result: ApiResult<*>): SyncReport {
        val (retryable, detail) = when (result) {
            is ApiResult.NetworkError -> true to "no connection"
            is ApiResult.HttpError -> isRetryable(result.code) to result.message
            is ApiResult.Success -> false to "unexpected response"
        }
        store.markFailed(draft.clientUuid, "$what: $detail", retryable)
        return if (retryable) SyncReport(retryableFailures = 1) else SyncReport(permanentFailures = 1)
    }

    companion object {
        // 401 is retryable: the refresh authenticator already tried, so the
        // seller has to log in again, after which the draft should still sync.
        fun isRetryable(code: Int) = code == 401 || code == 408 || code == 429 || code >= 500
    }
}
