# Django API (auth, catalog, orders, admin). Build from the repo root:
#   docker build -f backend-django/Dockerfile -t msme-django .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/backend-django

COPY backend-django/requirements.txt .
# The optional `pip_ca` secret is for building behind a TLS-intercepting
# proxy (docker build --secret id=pip_ca,src=/path/ca.crt); normal builds
# don't need it.
RUN --mount=type=secret,id=pip_ca,required=false \
    if [ -f /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi; \
    pip install -r requirements.txt

COPY backend-django/ .

RUN DJANGO_SECRET_KEY=collectstatic-only DJANGO_DEBUG=False python manage.py collectstatic --noinput \
    && useradd --create-home --uid 10001 app \
    && mkdir -p media && chown -R app media
USER app

EXPOSE 8000
# Migrations run on start so a fresh database (or a new release) is ready
# before traffic; they're idempotent.
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py seed_verticals && exec gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --timeout 60 --access-logfile -"]
