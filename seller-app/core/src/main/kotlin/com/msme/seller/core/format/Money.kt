package com.msme.seller.core.format

import java.math.BigDecimal
import java.math.RoundingMode

/** Indian-style amounts: ₹12,34,567.50 (lakh/crore digit grouping). */
object Money {
    fun rupees(amount: BigDecimal?, withSymbol: Boolean = true): String {
        if (amount == null) return "—"
        val scaled = amount.setScale(2, RoundingMode.HALF_UP)
        val negative = scaled.signum() < 0
        val plain = scaled.abs().toPlainString()
        val whole = plain.substringBefore('.')
        val fraction = plain.substringAfter('.', "00")
        val grouped = groupIndian(whole)
        val text = if (fraction == "00") grouped else "$grouped.$fraction"
        return (if (negative) "-" else "") + (if (withSymbol) "₹" else "") + text
    }

    fun quantity(amount: BigDecimal?, unit: String?): String {
        if (amount == null) return "—"
        val stripped = amount.stripTrailingZeros()
        val text = if (stripped.scale() < 0) stripped.setScale(0).toPlainString() else stripped.toPlainString()
        return listOfNotNull(text, unit?.takeIf { it.isNotBlank() }).joinToString(" ")
    }

    private fun groupIndian(digits: String): String {
        if (digits.length <= 3) return digits
        val last3 = digits.takeLast(3)
        val rest = digits.dropLast(3)
        val pairs = rest.reversed().chunked(2).joinToString(",").reversed()
        return "$pairs,$last3"
    }
}
