from rest_framework import serializers

from config.models import GradingSchema

from .grading import derive_grade
from .models import GradingEvidence, GradingResult, Listing


def _display_name(user):
    profile = getattr(user, "profile", None)
    if profile and profile.display_name:
        return profile.display_name
    return user.email


class ListingSerializer(serializers.ModelSerializer):
    seller = serializers.PrimaryKeyRelatedField(read_only=True)
    seller_name = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()
    grade_confidence = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id",
            "client_uuid",
            "seller",
            "seller_name",
            "vertical",
            "commodity_name",
            "sub_category",
            "quantity",
            "unit",
            "price_suggested",
            "price_final",
            "location_lat",
            "location_lng",
            "status",
            "grade",
            "grade_confidence",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "seller", "status", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["seller"] = self.context["request"].user
        return super().create(validated_data)

    def get_seller_name(self, listing):
        return _display_name(listing.seller)

    def _latest_grade(self, listing):
        # Cached per-instance for the lifetime of this serializer call so
        # get_grade/get_grade_confidence (both invoked per-list-item by DRF)
        # don't each trigger their own grading_results/schema queries.
        cached = getattr(listing, "_derived_grade", None)
        if cached is not None:
            return cached
        latest_result = listing.grading_results.order_by("-created_at").first()
        attribute_scores = latest_result.attribute_scores if latest_result else {}
        confidence = latest_result.confidence_score if latest_result else None
        schema = GradingSchema.objects.filter(vertical_id=listing.vertical_id).first()
        schema_attributes = schema.attributes if schema and schema.attributes else []
        grade, _grade_score = derive_grade(attribute_scores, schema_attributes)
        result = (grade, confidence)
        listing._derived_grade = result
        return result

    def get_grade(self, listing):
        grade, _confidence = self._latest_grade(listing)
        return grade

    def get_grade_confidence(self, listing):
        _grade, confidence = self._latest_grade(listing)
        return confidence


class GradingEvidenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingEvidence
        fields = ["id", "listing", "file", "file_type", "uploaded_at"]
        read_only_fields = ["id", "listing", "uploaded_at"]


class GradingResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingResult
        fields = [
            "id",
            "listing",
            "source",
            "confidence_score",
            "attribute_scores",
            "graded_by",
            "created_at",
            "notes",
        ]
        read_only_fields = ["id", "listing", "created_at"]
