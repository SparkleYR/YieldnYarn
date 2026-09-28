# FastAPI compute service (grading, pricing, matching, scheduled jobs).
# Build from the repo root — it needs ml-training/ for the shared model code
# and the trained graders:
#   docker build -f backend-fastapi/Dockerfile -t msme-fastapi .
#   docker build -f backend-fastapi/Dockerfile --build-arg WITH_ML=false -t msme-fastapi:lite .
FROM python:3.12-slim

ARG WITH_ML=true
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    GRADING_MODELS_DIR=/app/ml-training/checkpoints

WORKDIR /app/backend-fastapi

COPY backend-fastapi/requirements.txt backend-fastapi/requirements-ml.txt ./
# `pip_ca`: optional CA bundle for TLS-intercepting proxies (see backend-django/Dockerfile).
RUN --mount=type=secret,id=pip_ca,required=false \
    if [ -f /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi; \
    pip install -r requirements.txt \
    && if [ "$WITH_ML" = "true" ]; then \
         # CPU-only torch: the default Linux wheels drag in ~2.5 GB of CUDA.
         pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu \
         && pip install -r requirements-ml.txt; \
       fi

# Same relative layout as the repo: grading/ loads ../ml-training/scripts/*.py.
COPY ml-training/scripts/grading_model.py ml-training/scripts/preprocess.py /app/ml-training/scripts/
COPY ml-training/checkpoints/ /app/ml-training/checkpoints/
COPY backend-fastapi/ .

RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8001
# One worker: APScheduler runs in-process, and more workers would run each
# scheduled job once per worker. Scale out with replicas instead.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--proxy-headers"]
