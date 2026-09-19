import httpx
from django.conf import settings
from rest_framework import parsers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from config.models import GradingSchema
from core.permissions import IsListingOwnerOrReadOnly, IsVerifierOrAdmin
from notifications.models import Notification

from .grading import CONFIDENCE_VERIFICATION_THRESHOLD, derive_grade
from .models import GradingEvidence, GradingResult, Listing
from .serializers import (
    GradingEvidenceSerializer,
    GradingResultSerializer,
    ListingSerializer,
    _display_name,
)


class ListingViewSet(viewsets.ModelViewSet):
    """
    /api/catalog/listings/                       (list, create)
    /api/catalog/listings/{id}/                   (retrieve, update, destroy)
    /api/catalog/listings/{id}/evidence/          (POST file upload)
    /api/catalog/listings/{id}/grading/           (GET grading results)
    /api/catalog/listings/{id}/grading/trigger/   (POST -> triggers FastAPI grading)
    """

    serializer_class = ListingSerializer
    permission_classes = [IsListingOwnerOrReadOnly]
    parser_classes = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]
    filterset_fields = ["vertical", "status", "seller"]
    search_fields = ["commodity_name", "sub_category"]

    def get_queryset(self):
        user = self.request.user
        qs = Listing.objects.select_related("seller", "vertical").all()

        if not user.is_authenticated:
            return qs.filter(status=Listing.Status.ACTIVE)

        if user.is_superuser or user.role == "ADMIN":
            return qs
        if user.role == "SELLER":
            return qs.filter(seller=user)
        if user.role == "VERIFIER":
            return qs.filter(status=Listing.Status.PENDING_VERIFICATION)
        # BUYER (and any other authenticated role) only sees ACTIVE listings
        return qs.filter(status=Listing.Status.ACTIVE)

    def perform_create(self, serializer):
        serializer.save(
            seller=self.request.user, status=Listing.Status.PENDING_GRADING
        )

    @action(detail=True, methods=["post"], url_path="evidence")
    def upload_evidence(self, request, pk=None):
        listing = self.get_object()
        serializer = GradingEvidenceSerializer(
            data={**request.data, "listing": listing.id}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(listing=listing)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="grading")
    def grading(self, request, pk=None):
        listing = self.get_object()
        results = listing.grading_results.all()
        return Response(GradingResultSerializer(results, many=True).data)

    @action(detail=True, methods=["post"], url_path="grading/trigger")
    def trigger_grading(self, request, pk=None):
        listing = self.get_object()
        try:
            response = httpx.post(
                f"{settings.FASTAPI_BASE_URL}/compute/grading/grade",
                json={"listing_id": listing.id},
                timeout=30.0,
            )
        except httpx.HTTPError as exc:
            return Response(
                {"detail": f"Could not reach grading service: {exc}"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if response.status_code >= 400:
            return Response(
                {
                    "detail": "Grading service rejected the request.",
                    "upstream_status": response.status_code,
                    "upstream_body": response.text,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        body = response.json()

        # FastAPI's /compute/grading/grade only ever writes a GradingResult
        # row — it has no reason to also reach back into Django's Listing
        # table (they're separate services/DBs-of-record). Something on this
        # side has to be the one to advance the listing out of
        # PENDING_GRADING, or it never becomes visible to a verifier
        # (PENDING_VERIFICATION) or a buyer (ACTIVE) no matter how many times
        # grading runs. `needs_verification` already encodes exactly the
        # threshold check (CONFIDENCE_VERIFICATION_THRESHOLD) that decides
        # which of those two outcomes applies.
        if listing.status == Listing.Status.PENDING_GRADING:
            needs_verification = body.get("needs_verification", True)
            listing.status = (
                Listing.Status.PENDING_VERIFICATION
                if needs_verification
                else Listing.Status.ACTIVE
            )
            listing.save(update_fields=["status", "updated_at"])
            Notification.objects.create(
                user_id=listing.seller_id,
                type=Notification.Type.GRADING_COMPLETE,
                title="Grading complete",
                message=(
                    f"{listing.commodity_name} passed grading and is queued for verifier review."
                    if needs_verification
                    else f"{listing.commodity_name} passed grading and is now live in the catalog."
                ),
                related_object_type="listing",
                related_object_id=listing.id,
            )

        return Response(body, status=status.HTTP_200_OK)


def _priority_for_confidence(confidence):
    """Deliberate, simple, documented bucketing (§12) — not a final design.

    Every item in this queue already has confidence below
    CONFIDENCE_VERIFICATION_THRESHOLD (0.80; that's *why* it's queued), so
    the thresholds here are calibrated below that, not against [0, 1].
    """
    if confidence is None:
        return "HIGH"
    if confidence < 0.60:
        return "HIGH"
    if confidence < 0.75:
        return "MEDIUM"
    return "LOW"


def _flagged_reason(confidence):
    if confidence is None:
        return "No AI grading result yet."
    return (
        f"AI confidence {confidence * 100:.0f}% is below the "
        f"{CONFIDENCE_VERIFICATION_THRESHOLD * 100:.0f}% verification threshold."
    )


class VerificationQueueView(APIView):
    """GET /api/verification/queue/  (Verifier + Admin only)

    Returns an enriched view per listing — grade/confidence (derived via
    catalog/grading.py, §12), priority, a human-readable flagged reason, and
    evidence count — rather than a bare ListingSerializer, since that's what
    the verifier/admin queue UIs actually need to render without each
    fetching grading data separately per listing.
    """

    permission_classes = [IsVerifierOrAdmin]

    def get(self, request):
        listings = Listing.objects.filter(
            status=Listing.Status.PENDING_VERIFICATION
        ).select_related("seller", "seller__profile", "vertical")

        schema_attributes_by_vertical: dict[int, list] = {}

        def schema_attributes_for(vertical_id):
            if vertical_id not in schema_attributes_by_vertical:
                schema = GradingSchema.objects.filter(vertical_id=vertical_id).first()
                schema_attributes_by_vertical[vertical_id] = (
                    schema.attributes if schema and schema.attributes else []
                )
            return schema_attributes_by_vertical[vertical_id]

        items = []
        for listing in listings:
            latest_result = listing.grading_results.order_by("-created_at").first()
            attribute_scores = latest_result.attribute_scores if latest_result else {}
            confidence = latest_result.confidence_score if latest_result else None
            grade, _grade_score = derive_grade(
                attribute_scores, schema_attributes_for(listing.vertical_id)
            )

            items.append(
                {
                    "id": listing.id,
                    "listing_id": listing.id,
                    "commodity_name": listing.commodity_name,
                    "vertical": listing.vertical.slug,
                    "seller_name": _display_name(listing.seller),
                    "ai_grade": grade,
                    "ai_confidence": confidence,
                    "priority": _priority_for_confidence(confidence),
                    "status": "PENDING",
                    "evidence_image_count": listing.evidence.filter(
                        file_type=GradingEvidence.FileType.IMAGE
                    ).count(),
                    "flagged_reason": _flagged_reason(confidence),
                    "attribute_scores": [
                        {
                            "attribute": name,
                            # This pipeline's per-attribute scores double as
                            # per-attribute confidence (see grading/pipeline.py
                            # on the FastAPI side) — there's no separate value
                            # vs. confidence distinction in the data yet.
                            "ai_value": f"{score * 100:.1f}%",
                            "ai_confidence": score,
                        }
                        for name, score in attribute_scores.items()
                    ],
                    "created_at": (
                        latest_result.created_at if latest_result else listing.updated_at
                    ),
                }
            )

        return Response(items)


class VerificationReviewView(APIView):
    """POST /api/verification/queue/{listing_id}/review/

    Body: {"decision": "APPROVE"|"REJECT", "notes": str, "attribute_scores": {...}}
    """

    permission_classes = [IsVerifierOrAdmin]

    def post(self, request, listing_id):
        try:
            listing = Listing.objects.get(
                pk=listing_id, status=Listing.Status.PENDING_VERIFICATION
            )
        except Listing.DoesNotExist:
            return Response(
                {"detail": "Listing not found in verification queue."},
                status=status.HTTP_404_NOT_FOUND,
            )

        decision = request.data.get("decision", "APPROVE").upper()
        notes = request.data.get("notes", "")
        attribute_scores = request.data.get("attribute_scores")
        if not attribute_scores:
            # "Confirm AI Grade" (components/verifier/review-panel.tsx) sends
            # no attribute_scores at all — that means "I agree with the AI's
            # scores", not "this listing has no scores". Carry the latest
            # existing result's scores forward instead of defaulting to {},
            # which would otherwise silently blank out an AI-graded listing's
            # attribute_scores the moment a verifier confirms it — downstream
            # readers (matching's min_grade filter, pricing's grade
            # adjustment) derive a listing's grade from attribute_scores, not
            # from status, so an empty dict here makes a confirmed listing
            # look ungraded everywhere except the status field itself.
            latest_result = listing.grading_results.order_by("-created_at").first()
            attribute_scores = latest_result.attribute_scores if latest_result else {}

        GradingResult.objects.create(
            listing=listing,
            source=GradingResult.Source.VERIFIER,
            confidence_score=1.0,
            attribute_scores=attribute_scores,
            graded_by=request.user,
            notes=notes,
        )

        listing.status = (
            Listing.Status.ACTIVE
            if decision == "APPROVE"
            else Listing.Status.DRAFT
        )
        listing.save(update_fields=["status", "updated_at"])

        Notification.objects.create(
            user_id=listing.seller_id,
            type=Notification.Type.GRADING_COMPLETE,
            title="Listing reviewed",
            message=(
                f"{listing.commodity_name} was approved by a verifier and is now live."
                if decision == "APPROVE"
                else f"{listing.commodity_name} was sent back to draft by a verifier."
                + (f" Notes: {notes}" if notes else "")
            ),
            related_object_type="listing",
            related_object_id=listing.id,
        )

        return Response(ListingSerializer(listing).data)
