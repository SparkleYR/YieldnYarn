package com.msme.seller.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(
    entities = [DraftListingEntity::class, DraftEvidenceEntity::class, CachedListingEntity::class],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun draftDao(): DraftDao
    abstract fun listingDao(): ListingDao
}
