from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import IsAdminOrReadOnly

from .models import GradingSchema, PricingRule, Vertical
from .serializers import (
    GradingSchemaSerializer,
    PricingRuleSerializer,
    VerticalSerializer,
)


class VerticalViewSet(viewsets.ModelViewSet):
    """
    /api/config/verticals/            (list, create)
    /api/config/verticals/{id}/       (retrieve, update, destroy)
    """

    queryset = Vertical.objects.all()
    serializer_class = VerticalSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_fields = ["is_active"]
    search_fields = ["name", "slug"]


@extend_schema(request=GradingSchemaSerializer, responses=GradingSchemaSerializer)
class GradingSchemaDetailView(APIView):
    """
    GET/PUT /api/config/verticals/{id}/grading-schema/
    """

    permission_classes = [IsAdminOrReadOnly]

    def get(self, request, vertical_id):
        vertical = get_object_or_404(Vertical, pk=vertical_id)
        schema, _ = GradingSchema.objects.get_or_create(vertical=vertical)
        return Response(GradingSchemaSerializer(schema).data)

    def put(self, request, vertical_id):
        vertical = get_object_or_404(Vertical, pk=vertical_id)
        schema, _ = GradingSchema.objects.get_or_create(vertical=vertical)
        serializer = GradingSchemaSerializer(
            schema, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


@extend_schema(request=PricingRuleSerializer, responses=PricingRuleSerializer)
class PricingRuleDetailView(APIView):
    """
    GET/PUT /api/config/verticals/{id}/pricing-rules/
    """

    permission_classes = [IsAdminOrReadOnly]

    def get(self, request, vertical_id):
        vertical = get_object_or_404(Vertical, pk=vertical_id)
        rule, _ = PricingRule.objects.get_or_create(vertical=vertical)
        return Response(PricingRuleSerializer(rule).data)

    def put(self, request, vertical_id):
        vertical = get_object_or_404(Vertical, pk=vertical_id)
        rule, _ = PricingRule.objects.get_or_create(vertical=vertical)
        serializer = PricingRuleSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
