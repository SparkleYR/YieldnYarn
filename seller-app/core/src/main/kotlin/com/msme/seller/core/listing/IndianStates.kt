package com.msme.seller.core.listing

/**
 * States and union territories, spelled as Agmarknet / data.gov.in spell them,
 * because a listing's region is matched against price_points.region (one
 * mandi price per state) for local pricing.
 */
object IndianStates {
    val ALL: List<String> = listOf(
        "Andaman and Nicobar", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh",
        "Chattisgarh", "Dadra and Nagar Haveli", "Daman and Diu", "Goa", "Gujarat", "Haryana",
        "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh",
        "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
        "NCT of Delhi", "Odisha", "Pondicherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
        "Telangana", "Tripura", "Uttar Pradesh", "Uttrakhand", "West Bengal",
    )

    /** Canonical spelling for user input ("rajasthan " -> "Rajasthan"), or null if unknown. */
    fun normalize(input: String): String? {
        val key = input.trim().lowercase()
        if (key.isEmpty()) return null
        return ALL.firstOrNull { it.lowercase() == key } ?: ALIASES[key]
    }

    /** Case-insensitive prefix/substring suggestions for a picker. */
    fun suggest(query: String, limit: Int = 8): List<String> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return ALL
        return (ALL.filter { it.lowercase().startsWith(q) } + ALL.filter { q in it.lowercase() }).distinct().take(limit)
    }

    // Common modern spellings -> the ones the price data uses.
    private val ALIASES = mapOf(
        "chhattisgarh" to "Chattisgarh",
        "uttarakhand" to "Uttrakhand",
        "delhi" to "NCT of Delhi",
        "puducherry" to "Pondicherry",
        "orissa" to "Odisha",
    )
}
