from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import UserProfile

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "display_name",
            "avatar_url",
            "preferred_language",
            "location_lat",
            "location_lng",
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "role",
            "is_active",
            "created_at",
            "profile",
        ]
        read_only_fields = ["id", "is_active", "created_at"]


class AdminUserSerializer(serializers.ModelSerializer):
    """Admin user-management list/detail. Only `is_active` is writable here —
    email/phone/role changes are out of scope for this endpoint."""

    profile = UserProfileSerializer(required=False)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "phone",
            "role",
            "is_active",
            "created_at",
            "profile",
        ]
        read_only_fields = ["id", "email", "phone", "role", "created_at", "profile"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    display_name = serializers.CharField(
        write_only=True, required=False, allow_blank=True
    )

    class Meta:
        model = User
        fields = ["email", "phone", "password", "role", "display_name"]

    def validate_role(self, value):
        if value == User.Role.ADMIN:
            raise serializers.ValidationError(
                "Cannot self-register as ADMIN."
            )
        return value

    def create(self, validated_data):
        display_name = validated_data.pop("display_name", "")
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        UserProfile.objects.create(user=user, display_name=display_name)
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds role/email claims to the JWT, and logs in via `email`."""

    username_field = User.USERNAME_FIELD

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["email"] = user.email
        token["role"] = user.role
        return token
