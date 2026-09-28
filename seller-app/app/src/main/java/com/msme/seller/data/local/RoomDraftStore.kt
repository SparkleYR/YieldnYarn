package com.msme.seller.data.local

import androidx.room.withTransaction
import com.msme.seller.core.model.Listing
import com.msme.seller.core.sync.DraftStore
import com.msme.seller.core.sync.PendingDraft
import java.io.File
import javax.inject.Inject

/** The core sync engine's persistence, backed by Room. */
class RoomDraftStore @Inject constructor(private val db: AppDatabase) : DraftStore {
    private val drafts = db.draftDao()

    override suspend fun pendingDrafts(): List<PendingDraft> = drafts.syncable().map { it.toPendingDraft() }

    override suspend fun recordServerId(clientUuid: String, serverId: Long) = drafts.setServerId(clientUuid, serverId)

    override suspend fun markEvidenceUploaded(evidenceId: Long) = drafts.markEvidenceUploaded(evidenceId)

    override suspend fun markGradingTriggered(clientUuid: String) = drafts.markGradingTriggered(clientUuid)

    override suspend fun markSynced(clientUuid: String, serverListing: Listing) {
        val photos = drafts.evidenceFor(clientUuid)
        db.withTransaction {
            db.listingDao().upsert(serverListing.toEntity())
            drafts.delete(clientUuid)
        }
        // The server has the photos now; free the phone's storage.
        photos.forEach { File(it.path).delete() }
    }

    override suspend fun markFailed(clientUuid: String, error: String, retryable: Boolean) = drafts.setSyncState(
        clientUuid,
        if (retryable) DraftSyncState.RETRYING else DraftSyncState.NEEDS_ATTENTION,
        error,
    )
}
