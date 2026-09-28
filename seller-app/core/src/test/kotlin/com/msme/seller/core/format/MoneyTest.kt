package com.msme.seller.core.format

import org.junit.Assert.assertEquals
import org.junit.Test
import java.math.BigDecimal

class MoneyTest {
    @Test
    fun `indian digit grouping`() {
        assertEquals("₹999", Money.rupees(BigDecimal("999")))
        assertEquals("₹1,000", Money.rupees(BigDecimal("1000.00")))
        assertEquals("₹12,34,567.50", Money.rupees(BigDecimal("1234567.5")))
        assertEquals("₹1,00,00,000", Money.rupees(BigDecimal("10000000")))
        assertEquals("-₹2,500", Money.rupees(BigDecimal("-2500")))
        assertEquals("—", Money.rupees(null))
    }

    @Test
    fun `quantities drop trailing zeros`() {
        assertEquals("25 quintal", Money.quantity(BigDecimal("25.00"), "quintal"))
        assertEquals("12.5 kg", Money.quantity(BigDecimal("12.50"), "kg"))
        assertEquals("100", Money.quantity(BigDecimal("1E+2"), null))
    }
}
