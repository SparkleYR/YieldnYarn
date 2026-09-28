package com.msme.seller.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
abstract class DraftDao {
    /** Drafts the background sync should work on (not the ones awaiting the seller). */
    @Transaction
    @Query("SELECT * FROM draft_listings WHERE syncState != 'NEEDS_ATTENTION' ORDER BY createdAt")
    abstract suspend fun syncable(): List<DraftWithEvidence>

    @Transaction
    @Query("SELECT * FROM draft_listings ORDER BY createdAt DESC")
    abstract fun observeAll(): Flow<List<DraftWithEvidence>>

    @Query("SELECT COUNT(*) FROM draft_listings")
    abstract suspend fun count(): Int

    @Insert
    abstract suspend fun insertDraft(draft: DraftListingEntity)

    @Insert
    abstract suspend fun insertEvidence(evidence: List<DraftEvidenceEntity>)

    @Transaction
    open suspend fun insertWithEvidence(draft: DraftListingEntity, evidence: List<DraftEvidenceEntity>) {
        insertDraft(draft)
        insertEvidence(evidence)
    }

    @Query("SELECT * FROM draft_evidence WHERE draftUuid = :clientUuid")
    abstract suspend fun evidenceFor(clientUuid: String): List<DraftEvidenceEntity>

    @Query("SELECT path FROM draft_evidence")
    abstract suspend fun allEvidencePaths(): List<String>

    @Query("UPDATE draft_listings SET serverId = :serverId WHERE clientUuid = :clientUuid")
    abstract suspend fun setServerId(clientUuid: String, serverId: Long)

    @Query("UPDATE draft_evidence SET uploaded = 1 WHERE id = :evidenceId")
    abstract suspend fun markEvidenceUploaded(evidenceId: Long)

    @Query("UPDATE draft_listings SET gradingTriggered = 1 WHERE clientUuid = :clientUuid")
    abstract suspend fun markGradingTriggered(clientUuid: String)

    @Query("UPDATE draft_listings SET syncState = :state, lastError = :error WHERE clientUuid = :clientUuid")
    abstract suspend fun setSyncState(clientUuid: String, state: DraftSyncState, error: String?)

    @Query("DELETE FROM draft_listings WHERE clientUuid = :clientUuid")
    abstract suspend fun delete(clientUuid: String)

    @Query("DELETE FROM draft_listings")
    abstract suspend fun deleteAll()
}

@Dao
abstract class ListingDao {
    @Query("SELECT * FROM listings ORDER BY createdAt DESC")
    abstract fun observeAll(): Flow<List<CachedListingEntity>>

    @Query("SELECT * FROM listings WHERE id = :id")
    abstract fun observe(id: Long): Flow<CachedListingEntity?>

    @Upsert
    abstract suspend fun upsert(listing: CachedListingEntity)

    @Upsert
    abstract suspend fun upsertAll(listings: List<CachedListingEntity>)

    @Query("DELETE FROM listings WHERE id NOT IN (:keepIds)")
    abstract suspend fun deleteAllExcept(keepIds: List<Long>)

    @Query("DELETE FROM listings")
    abstract suspend fun deleteAll()

    /** Server wins: the cache becomes exactly what the server returned. */
    @Transaction
    open suspend fun replaceAll(listings: List<CachedListingEntity>) {
        if (listings.isEmpty()) deleteAll() else deleteAllExcept(listings.map { it.id })
        upsertAll(listings)
    }
}
