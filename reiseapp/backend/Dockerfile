# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv/app

# geoalchemy2/shapely need libgeos at runtime; build-essential only for wheels
# that have no manylinux build for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgeos-c1v5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/pyproject.toml ./
COPY backend/app ./app

FROM base AS runtime
RUN pip install --no-cache-dir .
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
# The read-only web viewer is served from the same origin as the API.
COPY web /srv/web
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd --system --uid 10001 reiseapp \
    && chown -R reiseapp:reiseapp /srv/app
USER reiseapp
EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS dev
RUN pip install --no-cache-dir -e ".[dev]"
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/tests ./tests
COPY web /srv/web
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
