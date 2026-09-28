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
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
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
    # Serves collected static files (admin, API docs) from the app container.
    "whitenoise.middleware.WhiteNoiseMiddleware",
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
        # Azure Database for PostgreSQL requires TLS: DB_SSLMODE=require.
        "OPTIONS": {"sslmode": env("DB_SSLMODE", "prefer")},
        "CONN_MAX_AGE": env_int("DB_CONN_MAX_AGE", 60),
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

# Media (grading evidence photos): local disk in development, Azure Blob
# Storage in production (django-storages) when AZURE_ACCOUNT_NAME is set —
# no model/view changes either way. Blob URLs are signed and expire, so the
# container can stay private.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / env("MEDIA_ROOT", "./media")  # type: ignore[operator]

AZURE_ACCOUNT_NAME = env("AZURE_ACCOUNT_NAME", "")
if AZURE_ACCOUNT_NAME:
    _media_storage = {
        "BACKEND": "storages.backends.azure_storage.AzureStorage",
        "OPTIONS": {
            "account_name": AZURE_ACCOUNT_NAME,
            "account_key": env("AZURE_ACCOUNT_KEY", ""),
            "azure_container": env("AZURE_CONTAINER", "media"),
            "expiration_secs": env_int("AZURE_URL_EXPIRATION_SECS", 3600),
        },
    }
else:
    _media_storage = {"BACKEND": "django.core.files.storage.FileSystemStorage"}

STORAGES = {
    "default": _media_storage,
    "staticfiles": {
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        ),
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
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
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
    # A rotated-out (or logged-out) refresh token can't be replayed.
    "BLACKLIST_AFTER_ROTATION": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# The web app keeps its refresh token in this httpOnly cookie (JS can't read
# it, so an XSS bug can't steal a long-lived session). Scoped to the auth
# endpoints; SameSite=Lax keeps it off cross-site POSTs. The Android app
# doesn't use it — it gets the refresh token in the response body.
REFRESH_COOKIE_NAME = "msme_refresh"
REFRESH_COOKIE_PATH = "/api/auth/"
REFRESH_COOKIE_SECURE = env_bool("REFRESH_COOKIE_SECURE", not DEBUG)
REFRESH_COOKIE_SAMESITE = env("REFRESH_COOKIE_SAMESITE", "Lax")

# CORS
# Credentials are needed for the refresh cookie on login/refresh/logout.
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:3000"
)
CORS_ALLOW_HEADERS = (
    "accept",
    "authorization",
    "content-type",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-auth-mode",
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

# Firebase service-account JSON used to send FCM pushes
# (notifications/fcm.py). Empty = push disabled; in-app notifications still
# work. Never commit this file.
FIREBASE_CREDENTIALS_FILE = env("FIREBASE_CREDENTIALS_FILE", "")

# OpenAPI schema (drf-spectacular): served at /api/schema/ (+ /api/docs/),
# committed as docs/api/openapi-django.yaml and checked for drift in CI.
SPECTACULAR_SETTINGS = {
    "TITLE": "MSME Marketplace API",
    "DESCRIPTION": "Django REST API: auth, catalog, orders/bids, disputes, notifications, pricing.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# Behind Azure Container Apps' HTTPS ingress: trust its X-Forwarded-Proto so
# request.is_secure() (and secure cookies/redirects) work.
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

# Error tracking (implementation_plan.md §11): on when SENTRY_DSN is set.
SENTRY_DSN = env("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1, send_default_pii=False)
