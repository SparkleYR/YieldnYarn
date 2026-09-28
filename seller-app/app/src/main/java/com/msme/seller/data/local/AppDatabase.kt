package com.msme.seller.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [DraftListingEntity::class, DraftEvidenceEntity::class, CachedListingEntity::class],
    version = 2,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun draftDao(): DraftDao
    abstract fun listingDao(): ListingDao

    companion object {
        /** v2: listings gained a state `region` (used for local mandi pricing). */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE draft_listings ADD COLUMN region TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE listings ADD COLUMN region TEXT NOT NULL DEFAULT ''")
            }
        }
    }
}
