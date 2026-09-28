package com.msme.seller.data.local

import com.msme.seller.core.model.CreateListingRequest
import com.msme.seller.core.model.Listing
import com.msme.seller.core.sync.PendingDraft
import com.msme.seller.core.sync.PendingEvidence
import java.io.File

fun Listing.toEntity() = CachedListingEntity(
    id = id,
    clientUuid = clientUuid,
    verticalId = vertical,
    commodityName = commodityName,
    subCategory = subCategory.orEmpty(),
    quantity = quantity,
    unit = unit,
    priceSuggested = priceSuggested,
    priceFinal = priceFinal,
    status = status,
    grade = grade,
    gradeConfidence = gradeConfidence,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

fun DraftWithEvidence.toPendingDraft() = PendingDraft(
    clientUuid = draft.clientUuid,
    request = CreateListingRequest(
        clientUuid = draft.clientUuid,
        vertical = draft.verticalId,
        commodityName = draft.commodityName,
        subCategory = draft.subCategory,
        quantity = draft.quantity,
        unit = draft.unit,
        priceSuggested = draft.priceSuggested,
        locationLat = draft.locationLat,
        locationLng = draft.locationLng,
    ),
    serverId = draft.serverId,
    evidence = evidence.filterNot { it.uploaded }.map { PendingEvidence(it.id, File(it.path)) },
    gradingTriggered = draft.gradingTriggered,
)
