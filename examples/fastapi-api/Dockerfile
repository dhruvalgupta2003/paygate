# syntax=docker/dockerfile:1.9
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3000

WORKDIR /app

COPY examples/fastapi-api/pyproject.toml ./
COPY examples/fastapi-api/main.py        ./

# Install limen from the local source tree so the example follows the
# workspace version, not whatever is on PyPI.
COPY packages/limen-python ./vendor/limen-python

RUN pip install --upgrade pip && \
    pip install ./vendor/limen-python[fastapi] && \
    pip install fastapi "uvicorn[standard]" redis

EXPOSE 3000
USER 1000:1000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
