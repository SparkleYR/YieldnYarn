package com.msme.seller.data.local

import org.junit.Assert.assertEquals
import org.junit.Test
import java.math.BigDecimal

class ConvertersTest {
    private val converters = Converters()

    @Test
    fun `decimals round-trip exactly`() {
        val value = BigDecimal("1250.50")
        assertEquals(value, converters.toBigDecimal(converters.fromBigDecimal(value)))
        assertEquals("10000000", converters.fromBigDecimal(BigDecimal("1E+7")))
    }
}
