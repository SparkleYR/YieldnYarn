package com.msme.seller.data.local

import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Relation
import androidx.room.TypeConverter
import java.math.BigDecimal

enum class DraftSyncState {
    /** Waiting for (or in the middle of) its first sync. */
    PENDING,

    /** Last attempt hit a network/server problem; WorkManager will retry. */
    RETRYING,

    /** The server rejected it (e.g. validation). Needs the seller: edit, retry, or delete. */
    NEEDS_ATTENTION,
}

/**
 * A listing created on the phone (status DRAFT_LOCAL in the UI, §8.3). Kept
 * until the server has it, all its photos, and a grading run — then it's
 * replaced by the server's copy in [CachedListingEntity] and deleted.
 */
@Entity(tableName = "draft_listings")
data class DraftListingEntity(
    @PrimaryKey val clientUuid: String,
    val verticalId: Long,
    val verticalName: String,
    val commodityName: String,
    val subCategory: String,
    val quantity: BigDecimal,
    val unit: String,
    val priceSuggested: BigDecimal?,
    val locationLat: Double?,
    val locationLng: Double?,
    val createdAt: Long,
    val serverId: Long? = null,
    val gradingTriggered: Boolean = false,
    val syncState: DraftSyncState = DraftSyncState.PENDING,
    val lastError: String? = null,
)

@Entity(
    tableName = "draft_evidence",
    foreignKeys = [
        ForeignKey(
            entity = DraftListingEntity::class,
            parentColumns = ["clientUuid"],
            childColumns = ["draftUuid"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("draftUuid")],
)
data class DraftEvidenceEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val draftUuid: String,
    /** Absolute path in app-private storage (filesDir/evidence). */
    val path: String,
    val uploaded: Boolean = false,
)

data class DraftWithEvidence(
    @Embedded val draft: DraftListingEntity,
    @Relation(parentColumn = "clientUuid", entityColumn = "draftUuid")
    val evidence: List<DraftEvidenceEntity>,
)

/** The server's copy of one of the seller's listings, for offline viewing. */
@Entity(tableName = "listings")
data class CachedListingEntity(
    @PrimaryKey val id: Long,
    val clientUuid: String?,
    val verticalId: Long,
    val commodityName: String,
    val subCategory: String,
    val quantity: BigDecimal,
    val unit: String,
    val priceSuggested: BigDecimal?,
    val priceFinal: BigDecimal?,
    val status: String,
    val grade: String?,
    val gradeConfidence: Double?,
    val createdAt: String?,
    val updatedAt: String?,
)

/** Money/quantities as exact decimal strings (Room adds the null handling for nullable columns). */
class Converters {
    @TypeConverter
    fun fromBigDecimal(value: BigDecimal): String = value.toPlainString()

    @TypeConverter
    fun toBigDecimal(value: String): BigDecimal = value.toBigDecimal()
}
