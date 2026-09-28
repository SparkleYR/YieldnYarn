package com.msme.seller.ui.create

import android.content.Context
import android.location.Location
import android.location.LocationManager

/**
 * Coarse "where is this produce" for matching's distance filter. Uses the
 * framework LocationManager's cached fix (no Play Services dependency) —
 * district-level accuracy is all a buyer's search radius needs.
 */
object LastLocation {
    fun get(context: Context): Location? {
        val manager = context.getSystemService(LocationManager::class.java) ?: return null
        return try {
            listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER, LocationManager.PASSIVE_PROVIDER)
                .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
                .mapNotNull { manager.getLastKnownLocation(it) }
                .maxByOrNull { it.time }
        } catch (e: SecurityException) {
            null
        }
    }
}
