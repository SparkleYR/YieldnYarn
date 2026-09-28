package com.msme.seller.core.auth

import com.google.gson.JsonParser
import java.util.Base64

/**
 * The claims this app cares about from a SimpleJWT access token. Decoded
 * locally (no signature check — that's the server's job) so the app can tell
 * a seller from other roles and know when the token expires without a call.
 */
data class JwtClaims(val userId: Long?, val email: String?, val role: String?, val expiresAtEpochSec: Long?) {
    fun isExpired(nowEpochSec: Long, leewaySec: Long = 30): Boolean =
        expiresAtEpochSec != null && nowEpochSec + leewaySec >= expiresAtEpochSec

    companion object {
        fun decode(token: String): JwtClaims? {
            val parts = token.split('.')
            if (parts.size != 3) return null
            return try {
                val json = String(Base64.getUrlDecoder().decode(parts[1].padBase64()))
                val obj = JsonParser.parseString(json).asJsonObject
                JwtClaims(
                    userId = obj.get("user_id")?.takeIf { !it.isJsonNull }?.asLong,
                    email = obj.get("email")?.takeIf { !it.isJsonNull }?.asString,
                    role = obj.get("role")?.takeIf { !it.isJsonNull }?.asString,
                    expiresAtEpochSec = obj.get("exp")?.takeIf { !it.isJsonNull }?.asLong,
                )
            } catch (e: Exception) {
                null
            }
        }

        private fun String.padBase64(): String = this + "=".repeat((4 - length % 4) % 4)
    }
}
