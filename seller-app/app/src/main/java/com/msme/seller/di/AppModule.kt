package com.msme.seller.di

import android.content.Context
import androidx.room.Room
import com.msme.seller.BuildConfig
import com.msme.seller.core.api.ApiClient
import com.msme.seller.core.api.PricingApi
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.sync.DraftStore
import com.msme.seller.core.sync.SyncEngine
import com.msme.seller.data.local.AppDatabase
import com.msme.seller.data.local.RoomDraftStore
import com.msme.seller.data.session.SessionManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.logging.HttpLoggingInterceptor
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    private fun logging() = HttpLoggingInterceptor().apply {
        // Never log bodies: they carry passwords and tokens.
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
    }

    @Provides
    @Singleton
    fun sellerApi(session: SessionManager): SellerApi =
        ApiClient.sellerApi(BuildConfig.API_BASE_URL, session) { addInterceptor(logging()) }

    @Provides
    @Singleton
    fun pricingApi(): PricingApi = ApiClient.pricingApi(BuildConfig.COMPUTE_BASE_URL) { addInterceptor(logging()) }

    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "seller.db")
            .addMigrations(AppDatabase.MIGRATION_1_2)
            .build()

    @Provides
    fun draftStore(db: AppDatabase): DraftStore = RoomDraftStore(db)

    @Provides
    fun syncEngine(api: SellerApi, store: DraftStore): SyncEngine = SyncEngine(api, store)
}
