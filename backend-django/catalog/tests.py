import tempfile
from unittest.mock import MagicMock, patch

import httpx
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import UserProfile
from config.models import GradingSchema, Vertical
from notifications.models import Notification

from .grading import derive_grade
from .models import GradingEvidence, GradingResult, Listing

User = get_user_model()


class DeriveGradeTest(APITestCase):
    """catalog/grading.py:derive_grade — mirrors backend-fastapi/grading/grade.py's
    own test suite (tests/test_grade.py) since the two are meant to behave
    identically."""

    SCHEMA = [
        {"name": "moisture", "weight": 0.5, "gradeable_by_ml": True},
        {"name": "purity", "weight": 0.3, "gradeable_by_ml": True},
        {"name": "color", "weight": 0.2, "gradeable_by_ml": False},
    ]

    def test_high_scores_yield_grade_a(self):
        grade, score = derive_grade({"moisture": 0.95, "purity": 0.9}, self.SCHEMA)
        self.assertEqual(grade, "Grade A")
        self.assertEqual(score, 0.9312)

    def test_low_scores_yield_grade_c(self):
        grade, score = derive_grade({"moisture": 0.3, "purity": 0.2}, self.SCHEMA)
        self.assertEqual(grade, "Grade C")
        self.assertEqual(score, 0.2625)

    def test_threshold_boundary_is_inclusive(self):
        grade, _ = derive_grade({"moisture": 0.85, "purity": 0.85}, self.SCHEMA)
        self.assertEqual(grade, "Grade A")

    def test_no_overlap_returns_none(self):
        grade, score = derive_grade({"unrelated": 0.9}, self.SCHEMA)
        self.assertIsNone(grade)
        self.assertIsNone(score)

    def test_none_inputs_return_none(self):
        grade, score = derive_grade(None, None)
        self.assertIsNone(grade)
        self.assertIsNone(score)


class ListingGradeFieldTest(APITestCase):
    """GET /api/catalog/listings/ — ListingSerializer's grade/grade_confidence/
    seller_name fields (catalog/serializers.py, §12), which the buyer catalog
    frontend needs to render grade badges without a second per-listing fetch."""

    def setUp(self):
        self.vertical = Vertical.objects.create(
            name="Agriculture", slug="agriculture-grade", unit_of_measure="kg"
        )
        GradingSchema.objects.create(
            vertical=self.vertical,
            attributes=[{"name": "moisture", "weight": 1.0, "gradeable_by_ml": True}],
        )
        self.seller = User.objects.create_user(
            email="seller-grade@example.com", password="pw12345", role="SELLER"
        )
        self.buyer = User.objects.create_user(
            email="buyer-grade@example.com", password="pw12345", role="BUYER"
        )
        self.url = "/api/catalog/listings/"

    def test_grade_derived_from_latest_grading_result(self):
        listing = Listing.objects.create(
            seller=self.seller,
            vertical=self.vertical,
            commodity_name="Wheat",
            quantity=10,
            unit="kg",
            status=Listing.Status.ACTIVE,
        )
        GradingResult.objects.create(
            listing=listing,
            source=GradingResult.Source.AI,
            confidence_score=0.9,
            attribute_scores={"moisture": 0.9},
        )
        UserProfile.objects.create(user=self.seller, display_name="Rajesh Kumar")
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertEqual(item["grade"], "Grade A")
        self.assertEqual(item["grade_confidence"], 0.9)
        self.assertEqual(item["seller_name"], "Rajesh Kumar")

    def test_ungraded_listing_returns_none_grade(self):
        Listing.objects.create(
            seller=self.seller,
            vertical=self.vertical,
            commodity_name="Wheat",
            quantity=10,
            unit="kg",
            status=Listing.Status.ACTIVE,
        )
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["results"][0]
        self.assertIsNone(item["grade"])
        self.assertIsNone(item["grade_confidence"])


class VerificationQueueTest(APITestCase):
    """GET /api/verification/queue/ — enriched shape (catalog/views.py:VerificationQueueView, §12)."""

    def setUp(self):
        self.vertical = Vertical.objects.create(
            name="Agriculture", slug="agriculture", unit_of_measure="kg"
        )
        GradingSchema.objects.create(
            vertical=self.vertical,
            attributes=[
                {"name": "moisture", "weight": 0.5, "gradeable_by_ml": True},
                {"name": "purity", "weight": 0.5, "gradeable_by_ml": True},
            ],
        )
        self.seller = User.objects.create_user(
            email="seller@example.com", password="pw12345", role="SELLER"
        )
        self.verifier = User.objects.create_user(
            email="verifier@example.com", password="pw12345", role="VERIFIER"
        )
        self.buyer = User.objects.create_user(
            email="buyer@example.com", password="pw12345", role="BUYER"
        )
        self.url = "/api/verification/queue/"

    def _make_listing(self, **kwargs):
        defaults = dict(
            seller=self.seller,
            vertical=self.vertical,
            commodity_name="Wheat",
            quantity=100,
            unit="kg",
            status=Listing.Status.PENDING_VERIFICATION,
        )
        defaults.update(kwargs)
        return Listing.objects.create(**defaults)

    def test_non_verifier_forbidden(self):
        self._make_listing()
        self.client.force_authenticate(user=self.buyer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_returns_enriched_shape_with_grading_result(self):
        listing = self._make_listing()
        GradingResult.objects.create(
            listing=listing,
            source=GradingResult.Source.AI,
            confidence_score=0.55,
            attribute_scores={"moisture": 0.9, "purity": 0.9},
        )
        UserProfile.objects.create(user=self.seller, display_name="Rajesh Kumar")
        GradingEvidence.objects.create(
            listing=listing, file="grading_evidence/x.jpg", file_type=GradingEvidence.FileType.IMAGE
        )

        self.client.force_authenticate(user=self.verifier)
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        item = response.data[0]
        self.assertEqual(item["listing_id"], listing.id)
        self.assertEqual(item["seller_name"], "Rajesh Kumar")
        self.assertEqual(item["vertical"], "agriculture")
        self.assertEqual(item["ai_grade"], "Grade A")
        self.assertEqual(item["ai_confidence"], 0.55)
        self.assertEqual(item["priority"], "HIGH")  # 0.55 < 0.60
        self.assertEqual(item["evidence_image_count"], 1)
        self.assertIn("55%", item["flagged_reason"])
        self.assertEqual(len(item["attribute_scores"]), 2)

    def test_falls_back_to_email_when_no_profile(self):
        listing = self._make_listing()
        GradingResult.objects.create(
            listing=listing, source=GradingResult.Source.AI, confidence_score=0.7, attribute_scores={}
        )

        self.client.force_authenticate(user=self.verifier)
        response = self.client.get(self.url)

        self.assertEqual(response.data[0]["seller_name"], "seller@example.com")

    def test_priority_thresholds(self):
        high = self._make_listing(commodity_name="High")
        GradingResult.objects.create(listing=high, source="AI", confidence_score=0.5, attribute_scores={})
        medium = self._make_listing(commodity_name="Medium")
        GradingResult.objects.create(listing=medium, source="AI", confidence_score=0.7, attribute_scores={})
        low = self._make_listing(commodity_name="Low")
        GradingResult.objects.create(listing=low, source="AI", confidence_score=0.78, attribute_scores={})

        self.client.force_authenticate(user=self.verifier)
        response = self.client.get(self.url)

        priority_by_commodity = {i["commodity_name"]: i["priority"] for i in response.data}
        self.assertEqual(priority_by_commodity["High"], "HIGH")
        self.assertEqual(priority_by_commodity["Medium"], "MEDIUM")
        self.assertEqual(priority_by_commodity["Low"], "LOW")

    def test_handles_no_grading_result_yet(self):
        self._make_listing()

        self.client.force_authenticate(user=self.verifier)
        response = self.client.get(self.url)

        item = response.data[0]
        self.assertIsNone(item["ai_grade"])
        self.assertIsNone(item["ai_confidence"])
        self.assertEqual(item["priority"], "HIGH")
        self.assertEqual(item["flagged_reason"], "No AI grading result yet.")

    def test_excludes_listings_not_pending_verification(self):
        self._make_listing(status=Listing.Status.ACTIVE)

        self.client.force_authenticate(user=self.verifier)
        response = self.client.get(self.url)

        self.assertEqual(len(response.data), 0)


class GradingTriggerTest(APITestCase):
    """POST /api/catalog/listings/{id}/grading/trigger/ -> proxies to FastAPI's
    POST /compute/grading/grade (catalog/views.py:trigger_grading)."""

    def setUp(self):
        self.vertical = Vertical.objects.create(
            name="Agriculture", slug="agriculture", unit_of_measure="kg"
        )
        self.seller = User.objects.create_user(
            email="seller@example.com", password="pw12345", role="SELLER"
        )
        self.listing = Listing.objects.create(
            seller=self.seller,
            vertical=self.vertical,
            commodity_name="Wheat",
            quantity=100,
            unit="kg",
            # Mirrors the real precondition: `ListingViewSet.perform_create`
            # always sets a freshly-created listing to PENDING_GRADING, and
            # that's what trigger_grading's status-transition guard checks.
            status=Listing.Status.PENDING_GRADING,
        )
        self.client.force_authenticate(user=self.seller)
        self.url = f"/api/catalog/listings/{self.listing.id}/grading/trigger/"

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_proxies_fastapi_response(self, mock_post):
        fastapi_body = {
            "listing_id": self.listing.id,
            "grading_result_id": 1,
            "attribute_scores": {"foreign_matter": 0.9},
            "overall_confidence": 0.92,
            "needs_verification": False,
            "method": "opencv-heuristic",
        }
        mock_post.return_value = MagicMock(status_code=200, json=lambda: fastapi_body)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, fastapi_body)

        mock_post.assert_called_once()
        called_url = mock_post.call_args.args[0]
        self.assertTrue(called_url.endswith("/compute/grading/grade"))
        self.assertEqual(
            mock_post.call_args.kwargs["json"], {"listing_id": self.listing.id}
        )

    @override_settings(COMPUTE_INTERNAL_TOKEN="s3cret")
    @patch("catalog.views.httpx.post")
    def test_trigger_grading_sends_internal_token(self, mock_post):
        mock_post.return_value = MagicMock(status_code=200, json=lambda: {"needs_verification": True})
        self.client.post(self.url)
        self.assertEqual(mock_post.call_args.kwargs["headers"], {"X-Internal-Token": "s3cret"})

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_activates_listing_when_confidence_is_high(self, mock_post):
        # Regression check: FastAPI's grading endpoint only ever writes a
        # GradingResult — nothing advances Listing.status unless this view
        # does it. Before this was added, a listing stayed PENDING_GRADING
        # forever no matter how many times grading ran.
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "listing_id": self.listing.id,
                "grading_result_id": 1,
                "attribute_scores": {"foreign_matter": 0.95},
                "overall_confidence": 0.95,
                "needs_verification": False,
                "method": "opencv-heuristic",
            },
        )

        self.client.post(self.url)

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_queues_listing_for_verification_when_confidence_is_low(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "listing_id": self.listing.id,
                "grading_result_id": 1,
                "attribute_scores": {"foreign_matter": 0.6},
                "overall_confidence": 0.6,
                "needs_verification": True,
                "method": "opencv-heuristic",
            },
        )

        self.client.post(self.url)

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.PENDING_VERIFICATION)

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_does_not_revert_an_already_active_listing(self, mock_post):
        self.listing.status = Listing.Status.ACTIVE
        self.listing.save(update_fields=["status"])
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "listing_id": self.listing.id,
                "grading_result_id": 2,
                "attribute_scores": {"foreign_matter": 0.5},
                "overall_confidence": 0.5,
                "needs_verification": True,
                "method": "opencv-heuristic",
            },
        )

        self.client.post(self.url)

        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_notifies_seller(self, mock_post):
        mock_post.return_value = MagicMock(
            status_code=200,
            json=lambda: {
                "listing_id": self.listing.id,
                "grading_result_id": 1,
                "attribute_scores": {"foreign_matter": 0.6},
                "overall_confidence": 0.6,
                "needs_verification": True,
                "method": "opencv-heuristic",
            },
        )

        self.client.post(self.url)

        self.assertEqual(Notification.objects.filter(user=self.seller).count(), 1)
        notification = Notification.objects.get(user=self.seller)
        self.assertEqual(notification.type, Notification.Type.GRADING_COMPLETE)
        self.assertIn("queued for verifier review", notification.message)
        self.assertEqual(notification.related_object_type, "listing")
        self.assertEqual(notification.related_object_id, self.listing.id)

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_returns_503_when_service_unreachable(self, mock_post):
        mock_post.side_effect = httpx.ConnectError("connection refused")

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @patch("catalog.views.httpx.post")
    def test_trigger_grading_returns_502_on_upstream_error(self, mock_post):
        mock_post.return_value = MagicMock(status_code=404, text="listing not found")

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

    def test_trigger_grading_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class VerificationReviewViewTest(APITestCase):
    """POST /api/verification/queue/{listing_id}/review/ (catalog/views.py:
    VerificationReviewView) — previously had zero test coverage despite
    being the actual verifier approve/reject action."""

    def setUp(self):
        self.vertical = Vertical.objects.create(
            name="Agriculture", slug="agriculture-review", unit_of_measure="kg"
        )
        self.seller = User.objects.create_user(
            email="seller-review@example.com", password="pw12345", role="SELLER"
        )
        self.verifier = User.objects.create_user(
            email="verifier-review@example.com", password="pw12345", role="VERIFIER"
        )
        self.buyer = User.objects.create_user(
            email="buyer-review@example.com", password="pw12345", role="BUYER"
        )
        self.listing = Listing.objects.create(
            seller=self.seller,
            vertical=self.vertical,
            commodity_name="Wheat",
            quantity=100,
            unit="kg",
            status=Listing.Status.PENDING_VERIFICATION,
        )
        self.url = f"/api/verification/queue/{self.listing.id}/review/"
        self.client.force_authenticate(user=self.verifier)

    def test_approve_activates_the_listing_and_records_a_verifier_grading_result(self):
        response = self.client.post(
            self.url, {"decision": "APPROVE", "notes": "Looks good", "attribute_scores": {"purity": "95%"}}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.ACTIVE)

        result = GradingResult.objects.get(listing=self.listing)
        self.assertEqual(result.source, GradingResult.Source.VERIFIER)
        self.assertEqual(result.graded_by, self.verifier)
        self.assertEqual(result.confidence_score, 1.0)
        self.assertEqual(result.notes, "Looks good")

    def test_confirming_without_attribute_scores_carries_forward_the_ai_scores(self):
        # Regression check: "Confirm AI Grade" (components/verifier/
        # review-panel.tsx) sends no attribute_scores at all — that used to
        # default to {}, silently blanking a confirmed listing's grade data
        # even though its status correctly went ACTIVE. Anything that derives
        # a grade from attribute_scores (matching's min_grade filter,
        # pricing's grade adjustment) would then treat a *confirmed,
        # AI-graded* listing as ungraded.
        GradingResult.objects.create(
            listing=self.listing,
            source=GradingResult.Source.AI,
            confidence_score=0.75,
            attribute_scores={"purity": 0.75, "moisture": 0.75},
        )

        response = self.client.post(self.url, {"decision": "APPROVE", "notes": "Looks good"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        latest_result = GradingResult.objects.filter(listing=self.listing).order_by("-created_at").first()
        self.assertEqual(latest_result.source, GradingResult.Source.VERIFIER)
        self.assertEqual(latest_result.attribute_scores, {"purity": 0.75, "moisture": 0.75})

    def test_explicit_override_scores_are_not_overwritten_by_ai_scores(self):
        GradingResult.objects.create(
            listing=self.listing,
            source=GradingResult.Source.AI,
            confidence_score=0.75,
            attribute_scores={"purity": 0.75},
        )

        response = self.client.post(
            self.url,
            {"decision": "APPROVE", "notes": "Corrected purity", "attribute_scores": {"purity": 0.5}},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        latest_result = GradingResult.objects.filter(listing=self.listing).order_by("-created_at").first()
        self.assertEqual(latest_result.attribute_scores, {"purity": 0.5})

    def test_reject_sends_the_listing_back_to_draft(self):
        response = self.client.post(self.url, {"decision": "REJECT", "notes": "Blurry evidence"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.status, Listing.Status.DRAFT)

    def test_notifies_the_seller_on_approve(self):
        self.client.post(self.url, {"decision": "APPROVE", "notes": ""}, format="json")

        notification = Notification.objects.get(user=self.seller)
        self.assertEqual(notification.type, Notification.Type.GRADING_COMPLETE)
        self.assertIn("now live", notification.message)

    def test_notifies_the_seller_on_reject_including_notes(self):
        self.client.post(self.url, {"decision": "REJECT", "notes": "Blurry evidence"}, format="json")

        notification = Notification.objects.get(user=self.seller)
        self.assertIn("sent back to draft", notification.message)
        self.assertIn("Blurry evidence", notification.message)

    def test_returns_404_for_a_listing_not_in_the_queue(self):
        active_listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Rice",
            quantity=10, unit="kg", status=Listing.Status.ACTIVE,
        )

        response = self.client.post(
            f"/api/verification/queue/{active_listing.id}/review/", {"decision": "APPROVE"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_buyer_forbidden(self):
        self.client.force_authenticate(user=self.buyer)

        response = self.client.post(self.url, {"decision": "APPROVE"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="msme-test-media-"))
class OfflineSyncCreateTest(APITestCase):
    """Idempotent listing creation for the offline-first seller app (§8.3)."""

    def setUp(self):
        self.seller = User.objects.create_user(email="sync-seller@example.com", password="pw12345", role="SELLER")
        self.other_seller = User.objects.create_user(email="sync-other@example.com", password="pw12345", role="SELLER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture", unit_of_measure="quintal")
        self.payload = {
            "client_uuid": "7f1d6c1e-3a52-4b8e-9f3c-2d8a1b0c9e11",
            "vertical": self.vertical.id,
            "commodity_name": "Wheat",
            "quantity": "25.00",
            "unit": "quintal",
        }

    def test_client_uuid_from_the_device_is_stored(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.post("/api/catalog/listings/", self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["client_uuid"], self.payload["client_uuid"])
        self.assertEqual(response.data["status"], Listing.Status.PENDING_GRADING)

    def test_retried_sync_returns_the_existing_listing_instead_of_a_duplicate(self):
        self.client.force_authenticate(user=self.seller)
        first = self.client.post("/api/catalog/listings/", self.payload, format="json")

        retry = self.client.post("/api/catalog/listings/", self.payload, format="json")

        self.assertEqual(retry.status_code, status.HTTP_200_OK)
        self.assertEqual(retry.data["id"], first.data["id"])
        self.assertEqual(Listing.objects.filter(client_uuid=self.payload["client_uuid"]).count(), 1)

    def test_another_sellers_uuid_is_rejected_without_leaking_their_listing(self):
        self.client.force_authenticate(user=self.seller)
        self.client.post("/api/catalog/listings/", self.payload, format="json")

        self.client.force_authenticate(user=self.other_seller)
        response = self.client.post("/api/catalog/listings/", self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("commodity_name", response.data)

    def test_client_uuid_is_optional(self):
        self.client.force_authenticate(user=self.seller)
        payload = {k: v for k, v in self.payload.items() if k != "client_uuid"}

        response = self.client.post("/api/catalog/listings/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["client_uuid"])

    def test_malformed_client_uuid_is_a_validation_error(self):
        self.client.force_authenticate(user=self.seller)

        response = self.client.post(
            "/api/catalog/listings/", {**self.payload, "client_uuid": "not-a-uuid"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("client_uuid", response.data)

    def test_client_uuid_cannot_be_changed_by_an_update(self):
        self.client.force_authenticate(user=self.seller)
        created = self.client.post("/api/catalog/listings/", self.payload, format="json")

        self.client.patch(
            f"/api/catalog/listings/{created.data['id']}/",
            {"client_uuid": "11111111-1111-4111-8111-111111111111"},
            format="json",
        )

        listing = Listing.objects.get(pk=created.data["id"])
        self.assertEqual(str(listing.client_uuid), self.payload["client_uuid"])

    def test_owner_can_list_evidence(self):
        listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Rice", quantity=5, unit="quintal"
        )
        GradingEvidence.objects.create(
            listing=listing, file=SimpleUploadedFile("grain.jpg", b"jpeg-bytes"), file_type="IMAGE"
        )
        self.client.force_authenticate(user=self.seller)

        response = self.client.get(f"/api/catalog/listings/{listing.id}/evidence/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["file_type"], "IMAGE")

    def test_owner_can_upload_evidence_as_multipart(self):
        # Regression: the view used to unpack request.data with {**...}, which
        # turns a multipart QueryDict into lists and rejected every real upload.
        listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Rice", quantity=5, unit="quintal"
        )
        self.client.force_authenticate(user=self.seller)

        response = self.client.post(
            f"/api/catalog/listings/{listing.id}/evidence/",
            {"file": SimpleUploadedFile("grain.jpg", b"jpeg-bytes", content_type="image/jpeg"), "file_type": "IMAGE"},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["listing"], listing.id)
        self.assertEqual(listing.evidence.count(), 1)

    def test_other_seller_cannot_upload_evidence(self):
        listing = Listing.objects.create(
            seller=self.seller, vertical=self.vertical, commodity_name="Rice", quantity=5, unit="quintal"
        )
        self.client.force_authenticate(user=self.other_seller)

        response = self.client.post(
            f"/api/catalog/listings/{listing.id}/evidence/",
            {"file": SimpleUploadedFile("grain.jpg", b"x", content_type="image/jpeg"), "file_type": "IMAGE"},
            format="multipart",
        )

        self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))


class ListingListQueryCountTest(APITestCase):
    """The list endpoint's query count must not grow with the page size
    (it did: three extra queries per listing for grade and seller name)."""

    def _add_listings(self, n):
        for i in range(n):
            listing = Listing.objects.create(
                seller=self.seller, vertical=self.vertical, commodity_name=f"Wheat {i}",
                quantity=10, unit="quintal", price_suggested=2000,
            )
            GradingResult.objects.create(listing=listing, attribute_scores={"foreign_matter": 0.9}, confidence_score=0.9)

    def setUp(self):
        self.seller = User.objects.create_user(email="qc-seller@example.com", password="pw12345", role="SELLER")
        self.vertical = Vertical.objects.create(name="Agriculture", slug="agriculture-qc", unit_of_measure="quintal")
        GradingSchema.objects.create(
            vertical=self.vertical, attributes=[{"name": "foreign_matter", "weight": 1.0, "gradeable_by_ml": True}]
        )
        self.client.force_authenticate(user=self.seller)

    def _queries_for_list(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get("/api/catalog/listings/")
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries), response

    def test_query_count_is_constant_in_page_size(self):
        self._add_listings(2)
        few, _ = self._queries_for_list()
        self._add_listings(15)
        many, response = self._queries_for_list()
        self.assertEqual(few, many)
        self.assertEqual(response.data["results"][0]["grade"], "Grade A")
