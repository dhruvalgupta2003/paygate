# syntax=docker/dockerfile:1.9

# ----- build stage --------------------------------------------------------
FROM python:3.14-slim-bookworm AS builder
WORKDIR /build

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY pyproject.toml README.md ./
COPY paygate ./paygate

RUN pip install --upgrade pip \
    && pip install .

# ----- runtime stage ------------------------------------------------------
FROM python:3.14-slim-bookworm AS runtime

RUN groupadd --system --gid 10001 paygate \
    && useradd --system --uid 10001 --gid 10001 --no-create-home paygate

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PAYGATE_RUNTIME=container

USER paygate:paygate
WORKDIR /app

EXPOSE 4021 9464

ENTRYPOINT ["paygate", "start"]
CMD []

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; \
res=urllib.request.urlopen('http://localhost:4021/livez', timeout=2); \
sys.exit(0 if res.status==200 else 1)" || exit 1
