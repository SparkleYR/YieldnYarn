from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ReputationScore
from .serializers import ReputationScoreSerializer

User = get_user_model()


@extend_schema(responses=ReputationScoreSerializer)
class ReputationDetailView(APIView):
    """GET /api/reputation/{user_id}/"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, user_id):
        try:
            reputation = ReputationScore.objects.get(user_id=user_id)
        except ReputationScore.DoesNotExist:
            try:
                user = User.objects.get(pk=user_id)
            except User.DoesNotExist:
                return Response(
                    {"detail": "User not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            # No transactions yet: return a zeroed-out default score.
            reputation = ReputationScore(user=user, role=user.role)
        return Response(ReputationScoreSerializer(reputation).data)
