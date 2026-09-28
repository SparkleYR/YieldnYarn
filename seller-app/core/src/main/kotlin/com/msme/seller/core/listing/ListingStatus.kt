package com.msme.seller.core.listing

/** Server-side `Listing.Status` values plus the app's own local-only draft state. */
enum class ListingStatus(val apiValue: String) {
    /** Created on the phone, not yet on the server (offline-first, §8.3). */
    DRAFT_LOCAL("DRAFT_LOCAL"),
    DRAFT("DRAFT"),
    PENDING_GRADING("PENDING_GRADING"),
    PENDING_VERIFICATION("PENDING_VERIFICATION"),
    ACTIVE("ACTIVE"),
    SOLD("SOLD"),
    EXPIRED("EXPIRED"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun from(value: String?): ListingStatus = entries.firstOrNull { it.apiValue == value } ?: UNKNOWN
    }
}

/** The "My Listings" filter chips (§8.2): Draft, Pending, Active, Sold. */
enum class ListingFilter(val statuses: Set<ListingStatus>) {
    ALL(ListingStatus.entries.toSet()),
    DRAFT(setOf(ListingStatus.DRAFT_LOCAL, ListingStatus.DRAFT)),
    PENDING(setOf(ListingStatus.PENDING_GRADING, ListingStatus.PENDING_VERIFICATION)),
    ACTIVE(setOf(ListingStatus.ACTIVE)),
    SOLD(setOf(ListingStatus.SOLD, ListingStatus.EXPIRED));

    fun matches(status: ListingStatus) = status in statuses
}
