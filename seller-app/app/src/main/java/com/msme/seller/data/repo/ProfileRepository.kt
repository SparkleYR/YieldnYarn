package com.msme.seller.data.repo

import com.msme.seller.core.api.ApiResult
import com.msme.seller.core.api.SellerApi
import com.msme.seller.core.api.apiCall
import com.msme.seller.core.model.Profile
import com.msme.seller.core.model.UpdateMeRequest
import com.msme.seller.core.model.User
import com.msme.seller.data.session.SessionManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(private val api: SellerApi, private val session: SessionManager) {
    suspend fun me() = apiCall { api.me() }

    suspend fun update(phone: String, profile: Profile): ApiResult<User> =
        apiCall { api.updateMe(UpdateMeRequest(phone = phone, profile = profile)) }.also {
            if (it is ApiResult.Success) session.updateDisplayName(it.value.displayName)
        }
}
