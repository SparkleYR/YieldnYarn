package com.msme.seller.core.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class JwtClaimsTest {
    private fun token(payload: String): String {
        val enc = Base64.getUrlEncoder().withoutPadding()
        return listOf("""{"alg":"HS256"}""", payload).joinToString(".") { enc.encodeToString(it.toByteArray()) } + ".sig"
    }

    @Test
    fun `decodes simplejwt claims`() {
        val claims = JwtClaims.decode(token("""{"user_id": 12, "email": "s@x.in", "role": "SELLER", "exp": 2000}"""))!!
        assertEquals(12L, claims.userId)
        assertEquals("SELLER", claims.role)
        assertFalse(claims.isExpired(nowEpochSec = 1000))
        assertTrue(claims.isExpired(nowEpochSec = 1990))
    }

    @Test
    fun `garbage is null`() {
        assertNull(JwtClaims.decode("not-a-jwt"))
        assertNull(JwtClaims.decode("a.b.c"))
    }
}
