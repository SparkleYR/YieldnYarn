"""
Django settings for the MSME Multi-Vertical Commodity Marketplace project.

Environment variables are loaded from the monorepo root `.env` file
(`../.env` relative to this `backend-django/` directory) using python-dotenv.
See `implementation_plan.md` for the full system design.
"""

from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load the monorepo root .env file (backend-django/../.env)
load_dotenv(BASE_DIR.parent / ".env")


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default) or default


def env_bool(key: str, default: bool = False) -> bool:
    value = os.environ.get(key)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def env_list(key: str, default: str = "") -> list[str]:
    value = os.environ.get(key, default) or default
    return [item.strip() for item in value.split(",") if item.strip()]


def env_int(key: str, default: int) -> int:
    value = os.environ.get(key)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY: str = env(
    "DJANGO_SECRET_KEY",
    "django-insecure-dev-only-key-change-me",
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    # Local apps
    "accounts",
    "config",
    "catalog",
    "orders",
    "disputes",
    "notifications",
    "reputation",
    "pricing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", "msme_marketplace"),
        "USER": env("DB_USER", "msme_dev"),
        "PASSWORD": env("DB_PASSWORD", "devpassword"),
        "HOST": env("DB_HOST", "localhost"),
        "PORT": env("DB_PORT", "5432"),
    }
}


# Custom user model
AUTH_USER_MODEL = "accounts.User"


# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files — local FileSystemStorage for now.
# Structured so it's easy to swap to Azure Blob Storage (via django-storages)
# later: just set DEFAULT_FILE_STORAGE / STORAGES["default"] to the Azure
# backend and provide the AZURE_* credentials, no model/view changes needed.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / env("MEDIA_ROOT", "./media")  # type: ignore[operator]

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Django REST Framework

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env_int("JWT_ACCESS_TOKEN_LIFETIME_MIN", 15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env_int("JWT_REFRESH_TOKEN_LIFETIME_DAYS", 7)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# CORS
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
)

# Base URL of the FastAPI compute service (grading/pricing/matching).
FASTAPI_BASE_URL = env("FASTAPI_BASE_URL", "http://localhost:8001")

# Base URL of the Next.js web app — used to build the link inside a
# password-reset email (accounts/views.py:PasswordResetRequestView).
FRONTEND_URL = env("FRONTEND_URL", "http://localhost:3000")

# No real SMTP credentials exist in local dev — the console backend writes
# the full email (including the reset link) to stdout, which is a real,
# standard Django pattern for this, not a stub. Set EMAIL_BACKEND/EMAIL_HOST
# etc. via env vars for a real deployment.
EMAIL_BACKEND = env("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", "no-reply@msmemarketplace.local")
