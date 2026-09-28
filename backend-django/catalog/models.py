import uuid

from django.conf import settings
from django.db import models

from config.models import Vertical


def evidence_upload_path(instance, filename):
    return f"grading_evidence/listing_{instance.listing_id}/{filename}"


class Listing(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PENDING_GRADING = "PENDING_GRADING", "Pending Grading"
        PENDING_VERIFICATION = "PENDING_VERIFICATION", "Pending Verification"
        ACTIVE = "ACTIVE", "Active"
        SOLD = "SOLD", "Sold"
        EXPIRED = "EXPIRED", "Expired"

    # Client-generated UUID enables idempotent creation from the offline-first
    # Kotlin seller app (sync on reconnection without creating duplicates).
    client_uuid = models.UUIDField(
        default=uuid.uuid4, unique=True, editable=False
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="listings",
    )
    vertical = models.ForeignKey(
        Vertical, on_delete=models.PROTECT, related_name="listings"
    )
    commodity_name = models.CharField(max_length=150)
    sub_category = models.CharField(max_length=150, blank=True, default="")
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=30)
    price_suggested = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    price_final = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    location_lat = models.FloatField(null=True, blank=True)
    location_lng = models.FloatField(null=True, blank=True)
    # Free-text state name ("Rajasthan"), the same granularity as
    # price_points.region (Agmarknet ingestion stores one price per state), so
    # pricing can use the local mandi price for this listing. Independent of
    # location_lat/lng, which drive matching's distance filter.
    region = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(
        max_length=25, choices=Status.choices, default=Status.DRAFT
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "listings"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["vertical", "status"], name="idx_listings_vert_status"),
        ]

    def __str__(self):
        return f"{self.commodity_name} ({self.seller_id})"


class GradingEvidence(models.Model):
    class FileType(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        VIDEO = "VIDEO", "Video"
        DOCUMENT = "DOCUMENT", "Document"

    listing = models.ForeignKey(
        Listing, on_delete=models.CASCADE, related_name="evidence"
    )
    file = models.FileField(upload_to=evidence_upload_path)
    file_type = models.CharField(max_length=10, choices=FileType.choices)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grading_evidence"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"Evidence<{self.listing_id}:{self.file_type}>"


class GradingResult(models.Model):
    class Source(models.TextChoices):
        AI = "AI", "AI"
        VERIFIER = "VERIFIER", "Verifier"

    listing = models.ForeignKey(
        Listing, on_delete=models.CASCADE, related_name="grading_results"
    )
    source = models.CharField(max_length=10, choices=Source.choices)
    confidence_score = models.FloatField(null=True, blank=True)
    attribute_scores = models.JSONField(default=dict, blank=True)
    graded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="grading_results",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        db_table = "grading_results"
        ordering = ["-created_at"]

    def __str__(self):
        return f"GradingResult<{self.listing_id}:{self.source}>"
