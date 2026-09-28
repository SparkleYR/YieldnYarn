package com.msme.seller.data.repo

import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.api.fetchAllPages
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepository @Inject constructor(private val api: SellerApi) {
    suspend fun all() = fetchAllPages(maxPages = 5) { page -> api.notifications(page) }

    suspend fun markRead(id: Long) = apiCall { api.markNotificationRead(id) }

    suspend fun markAllRead() = apiCall { api.markAllNotificationsRead() }
}
